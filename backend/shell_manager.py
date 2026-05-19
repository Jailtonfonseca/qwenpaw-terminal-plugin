# -*- coding: utf-8 -*-
"""
Shell Manager — Gerencia processos shell com suporte a PTY.

Gerencia:
  - Processos shell em execução com PTY (pseudo-terminal)
  - Diretório de trabalho atual (CWD) por sessão
  - Streaming de saída em tempo real via WebSocket
  - Envio de input (stdin) para processos ativos
  - Kill/Ctrl+C de processos
  - Histórico de comandos
"""

import asyncio
import logging
import os
import pty
import select
import signal
import subprocess
import sys
from typing import Dict, Optional

logger = logging.getLogger(__name__)

# Shell a ser usado (configurável via env)
DEFAULT_SHELL = os.environ.get("SHELL", "/bin/sh")
if not os.path.exists(DEFAULT_SHELL):
    DEFAULT_SHELL = "/bin/sh"


class SessionProcess:
    """Representa um processo shell com PTY para uma sessão."""

    def __init__(self, session_id: str, cwd: Optional[str] = None):
        self.session_id = session_id
        self.process: Optional[asyncio.subprocess.Process] = None
        self.pid: Optional[int] = None
        self.master_fd: Optional[int] = None
        self.cwd = cwd or os.path.expanduser("~")
        self.running = False
        self._reader_task: Optional[asyncio.Task] = None

    async def start(self):
        """Inicia o processo shell com PTY."""
        if self.running:
            return

        # Cria PTY
        self.master_fd, slave_fd = pty.openpty()

        self.process = await asyncio.create_subprocess_exec(
            DEFAULT_SHELL,
            "--login" if DEFAULT_SHELL != "/bin/sh" else "",
            stdin=slave_fd,
            stdout=slave_fd,
            stderr=slave_fd,
            cwd=self.cwd,
            env={
                **os.environ,
                "TERM": "xterm-256color",
                "SHELL": DEFAULT_SHELL,
                "PS1": "\\[\\e[32m\\]\\w\\[\\e[0m\\] $ ",
            },
            preexec_fn=os.setsid,
        )

        os.close(slave_fd)
        self.pid = self.process.pid
        self.running = True
        logger.info(
            f"Session {self.session_id}: shell started (pid={self.pid}, "
            f"cwd={self.cwd})"
        )

    async def read_output(self, max_bytes: int = 65536) -> bytes:
        """Lê a saída disponível do PTY (non-blocking)."""
        if self.master_fd is None:
            return b""

        loop = asyncio.get_event_loop()
        data = b""

        try:
            while True:
                # Non-blocking read using select
                r, _, _ = select.select([self.master_fd], [], [], 0.01)
                if not r:
                    break
                chunk = os.read(self.master_fd, 4096)
                if not chunk:
                    break
                data += chunk
                if len(data) >= max_bytes:
                    break
        except (BlockingIOError, OSError):
            pass

        return data

    async def write_input(self, data: str):
        """Escreve dados no stdin do processo."""
        if self.master_fd is None or not self.running:
            return

        try:
            os.write(self.master_fd, data.encode("utf-8"))
        except OSError as e:
            logger.error(
                f"Session {self.session_id}: write error: {e}"
            )

    async def send_signal(self, sig: int = signal.SIGTERM):
        """Envia um sinal para o processo."""
        if self.process and self.process.pid:
            try:
                pgid = os.getpgid(self.process.pid)
                os.killpg(pgid, sig)
            except (ProcessLookupError, PermissionError, OSError) as e:
                logger.warning(
                    f"Session {self.session_id}: signal error: {e}"
                )

    async def resize_pty(self, cols: int, rows: int):
        """Redimensiona o PTY (para ajuste de terminal)."""
        if self.master_fd is not None:
            try:
                import fcntl
                import struct
                import termios

                buf = struct.pack("HHHH", rows, cols, 0, 0)
                fcntl.ioctl(self.master_fd, termios.TIOCSWINSZ, buf)
            except (ImportError, OSError) as e:
                logger.warning(
                    f"Session {self.session_id}: resize error: {e}"
                )

    async def stop(self):
        """Finaliza o processo shell."""
        if not self.running:
            return

        self.running = False
        try:
            await self.send_signal(signal.SIGHUP)
            await asyncio.sleep(0.3)
            if self.process and self.process.returncode is None:
                await self.send_signal(signal.SIGKILL)
                await asyncio.sleep(0.2)
        except Exception as e:
            logger.error(
                f"Session {self.session_id}: stop error: {e}"
            )

        if self.master_fd is not None:
            try:
                os.close(self.master_fd)
            except OSError:
                pass
            self.master_fd = None

        logger.info(
            f"Session {self.session_id}: shell stopped"
        )

    @property
    def is_alive(self) -> bool:
        """Verifica se o processo ainda está rodando."""
        if self.process and self.process.returncode is None:
            return True
        return False


class ShellManager:
    """Gerenciador global de sessões shell.

    Mantém um mapa de sessões (session_id → SessionProcess).
    Cada sessão tem seu próprio processo shell com PTY,
    diretório de trabalho e estado.
    """

    def __init__(self):
        self._sessions: Dict[str, SessionProcess] = {}
        self._lock = asyncio.Lock()

    async def get_or_create_session(
        self, session_id: str, cwd: Optional[str] = None
    ) -> SessionProcess:
        """Obtém ou cria uma sessão shell."""
        async with self._lock:
            if session_id not in self._sessions:
                session = SessionProcess(session_id, cwd)
                await session.start()
                self._sessions[session_id] = session
            else:
                session = self._sessions[session_id]
                if cwd and cwd != session.cwd:
                    session.cwd = cwd
                    # Muda o diretório no shell ativo
                    await session.write_input(f"cd {cwd}\n")
                    await asyncio.sleep(0.05)
            return session

    async def execute_command(
        self,
        session_id: str,
        command: str,
        cwd: Optional[str] = None,
        timeout: Optional[float] = 30.0,
    ) -> Dict:
        """Executa um comando shell e retorna a saída.

        Args:
            session_id: Identificador da sessão
            command: Comando a ser executado
            cwd: Diretório de trabalho (opcional)
            timeout: Timeout em segundos (default: 30, None = sem timeout)

        Returns:
            Dict com output, exit_code, error
        """
        session = await self.get_or_create_session(session_id, cwd)
        result = {"output": "", "exit_code": -1, "error": None}

        try:
            # Limpa buffer de saída anterior
            await session.read_output()

            # Envia o comando
            await session.write_input(command + "\n")
            await session.write_input("echo __QWENPAW_EXIT__$?\n")

            # Aguarda saída com polling
            output = b""
            deadline = (
                (asyncio.get_event_loop().time() + timeout)
                if timeout
                else None
            )

            while True:
                if deadline and asyncio.get_event_loop().time() > deadline:
                    result["error"] = f"Command timed out ({timeout}s)"
                    break

                chunk = await session.read_output()
                if chunk:
                    output += chunk
                    # Verifica marcador de finalização
                    if b"__QWENPAW_EXIT__" in output:
                        break

                if not chunk:
                    await asyncio.sleep(0.05)

            # Parse do output
            decoded = output.decode("utf-8", errors="replace")
            # Extrai exit code do marcador
            if "__QWENPAW_EXIT__" in decoded:
                parts = decoded.split("__QWENPAW_EXIT__")
                result["output"] = parts[0].strip()
                exit_str = parts[1].strip().split("\n")[0] if len(parts) > 1 else ""
                try:
                    result["exit_code"] = int(exit_str.strip())
                except ValueError:
                    result["exit_code"] = -1
            else:
                result["output"] = decoded.strip()

        except Exception as e:
            result["error"] = str(e)
            logger.error(
                f"Session {session_id}: exec error: {e}"
            )

        return result

    async def get_cwd(self, session_id: str) -> Optional[str]:
        """Obtém o diretório de trabalho atual da sessão."""
        session = self._sessions.get(session_id)
        if session:
            return session.cwd
        return None

    async def set_cwd(self, session_id: str, path: str) -> bool:
        """Define o diretório de trabalho da sessão.

        Verifica se o path existe antes de mudar.
        """
        if not os.path.isdir(path):
            return False

        session = self._sessions.get(session_id)
        if session:
            session.cwd = os.path.abspath(path)
            await session.write_input(f"cd {path}\n")
            return True
        return False

    async def kill_process(self, session_id: str, sig: int = signal.SIGTERM):
        """Encerra um processo em execução."""
        session = self._sessions.get(session_id)
        if session:
            await session.send_signal(sig)

    async def cleanup_session(self, session_id: str):
        """Limpa e remove uma sessão."""
        async with self._lock:
            session = self._sessions.pop(session_id, None)
            if session:
                await session.stop()

    async def cleanup_all(self):
        """Limpa todas as sessões ativas."""
        async with self._lock:
            for session_id in list(self._sessions.keys()):
                session = self._sessions.pop(session_id)
                await session.stop()

    async def exec_direct(
        self,
        command: str,
        cwd: Optional[str] = None,
        timeout: Optional[float] = 30.0,
    ) -> Dict:
        """Executa um comando diretamente (sem sessão persistente).

        Útil para comandos rápidos que não precisam de estado de shell.

        Args:
            command: Comando a executar
            cwd: Diretório de trabalho
            timeout: Timeout em segundos

        Returns:
            Dict com stdout, stderr, exit_code, error
        """
        result = {"stdout": "", "stderr": "", "exit_code": -1, "error": None}

        try:
            proc = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=cwd or os.path.expanduser("~"),
                env=os.environ,
            )

            try:
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(), timeout=timeout
                )
                result["stdout"] = stdout.decode("utf-8", errors="replace")
                result["stderr"] = stderr.decode("utf-8", errors="replace")
                result["exit_code"] = proc.returncode or 0
            except asyncio.TimeoutError:
                proc.kill()
                await proc.wait()
                result["error"] = f"Command timed out ({timeout}s)"
                result["exit_code"] = -1

        except FileNotFoundError as e:
            result["error"] = f"Command not found: {e}"
        except PermissionError as e:
            result["error"] = f"Permission denied: {e}"
        except Exception as e:
            result["error"] = str(e)
            logger.error(f"exec_direct error: {e}")

        return result

    def check_command(self, cmd: str) -> Dict:
        """Verifica se um comando existe no sistema.

        Retorna dict com:
        - exists: bool
        - path: caminho completo ou None
        - type: tipo (builtin, binary, alias, etc)
        - error: mensagem de erro se houver
        """
        # Primeiro: comando simples (sem pipes/redirects)
        base_cmd = cmd.strip().split()[0] if cmd.strip() else ""
        result = {"exists": False, "path": None, "type": None, "error": None}

        if not base_cmd:
            result["error"] = "Empty command"
            return result

        # Verifica via shutil.which
        cmd_path = self._which(base_cmd)
        if cmd_path:
            result["exists"] = True
            result["path"] = cmd_path
            result["type"] = "binary"
            return result

        # Verifica builtins do shell
        builtins = {
            "cd", "exit", "pwd", "echo", "export", "unset",
            "alias", "unalias", "type", "which", "source", ".",
            "fg", "bg", "jobs", "kill", "trap", "break", "continue",
            "return", "shift", "read", "set", "unset", "ulimit",
            "umask", "test", "[", "eval", "exec", "let", "local",
        }
        if base_cmd in builtins:
            result["exists"] = True
            result["type"] = "builtin"
            return result

        result["error"] = f"Command not found: {base_cmd}"
        return result

    @staticmethod
    def _which(cmd: str) -> Optional[str]:
        """Encontra o caminho completo de um comando."""
        import shutil
        return shutil.which(cmd)


# Singleton global
shell_manager = ShellManager()
