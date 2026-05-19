# -*- coding: utf-8 -*-
"""
Terminal API — FastAPI router para o terminal integrado do QwenPaw.

Endpoints:
  - WS /api/terminal/ws — WebSocket para terminal interativo em tempo real
  - POST /api/terminal/exec — Execução de comando único (non-interactive)
  - GET /api/terminal/cwd — Obter diretório de trabalho atual
  - POST /api/terminal/cwd — Definir diretório de trabalho
  - GET /api/terminal/which/{command} — Verificar disponibilidade de comando
  - POST /api/terminal/kill — Encerrar processo em execução
  - POST /api/terminal/resize — Redimensionar PTY (cols/rows)
"""

import asyncio
import json
import logging
import os
import signal
from typing import Dict, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .shell_manager import shell_manager, SessionProcess

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/terminal", tags=["terminal"])


# ── WebSocket — Terminal interativo em tempo real ───────────────────────


@router.websocket("/ws")
async def terminal_websocket(websocket: WebSocket):
    """WebSocket para terminal interativo.

    Fluxo:
      1. Cliente conecta e envia JSON: {"type": "init", "session_id": "...", "cwd": "..."}
      2. Servidor cria/inicia sessão shell com PTY
      3. Loop bidirecional:
         - Cliente → Servidor: {"type": "input", "data": "ls -la"}
         - Servidor → Cliente: {"type": "output", "data": "...", "exit_code": 0}
         - Cliente → Servidor: {"type": "resize", "cols": 80, "rows": 24}
         - Cliente → Servidor: {"type": "signal", "signal": "SIGTERM"}
         - Cliente → Servidor: {"type": "cwd", "path": "/home/user"}
      4. Cliente → Servidor: {"type": "ping"}  →  {"type": "pong"}
      5. Desconexão limpa a sessão
    """
    await websocket.accept()
    session_id = "default"
    session: Optional[SessionProcess] = None
    reader_task: Optional[asyncio.Task] = None

    try:
        # ── Handshake inicial ──────────────────────────────────────
        init_msg = await websocket.receive_text()
        init_data = json.loads(init_msg)

        if init_data.get("type") == "init":
            session_id = init_data.get("session_id", "default")
            cwd = init_data.get("cwd") or os.path.expanduser("~")

            # Cria/inicia sessão
            session = await shell_manager.get_or_create_session(
                session_id, cwd
            )

            await websocket.send_text(json.dumps({
                "type": "init_ack",
                "session_id": session_id,
                "cwd": session.cwd,
                "shell": os.environ.get("SHELL", "/bin/sh"),
                "pid": session.pid,
            }))

            # Task para ler output em background
            async def read_loop():
                try:
                    while session and session.running:
                        data = await session.read_output()
                        if data:
                            decoded = data.decode("utf-8", errors="replace")
                            try:
                                await websocket.send_text(json.dumps({
                                    "type": "output",
                                    "data": decoded,
                                }))
                            except Exception:
                                break
                        else:
                            await asyncio.sleep(0.03)
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    logger.debug(f"Read loop ended: {e}")

            reader_task = asyncio.create_task(read_loop())

        # ── Loop principal ─────────────────────────────────────────
        async for message in websocket.iter_text():
            try:
                data = json.loads(message)
                msg_type = data.get("type", "")

                if msg_type == "input":
                    if session:
                        await session.write_input(data.get("data", ""))

                elif msg_type == "resize":
                    if session:
                        cols = data.get("cols", 80)
                        rows = data.get("rows", 24)
                        await session.resize_pty(cols, rows)

                elif msg_type == "signal":
                    if session:
                        sig_name = data.get("signal", "SIGTERM")
                        sig_map = {
                            "SIGINT": signal.SIGINT,
                            "SIGTERM": signal.SIGTERM,
                            "SIGKILL": signal.SIGKILL,
                            "SIGHUP": signal.SIGHUP,
                            "SIGQUIT": signal.SIGQUIT,
                        }
                        sig = sig_map.get(sig_name, signal.SIGTERM)
                        await session.send_signal(sig)

                elif msg_type == "cwd":
                    if session:
                        path = data.get("path", "")
                        if os.path.isdir(path):
                            session.cwd = os.path.abspath(path)
                            await session.write_input(f"cd {path}\n")
                            await websocket.send_text(json.dumps({
                                "type": "cwd_ack",
                                "cwd": session.cwd,
                            }))

                elif msg_type == "ping":
                    await websocket.send_text(json.dumps({
                        "type": "pong",
                    }))

                elif msg_type == "exec":
                    """Executa um comando e retorna o resultado completo."""
                    if session:
                        command = data.get("command", "")
                        timeout = data.get("timeout", 30.0)
                        result = await shell_manager.execute_command(
                            session_id, command,
                            timeout=timeout,
                        )
                        await websocket.send_text(json.dumps({
                            "type": "exec_result",
                            **result,
                        }))

            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": "Invalid JSON message",
                }))

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: session={session_id}")
    except Exception as e:
        logger.error(f"WebSocket error (session={session_id}): {e}")
    finally:
        # Cancela reader task
        if reader_task:
            reader_task.cancel()
            try:
                await reader_task
            except asyncio.CancelledError:
                pass

        # Não limpa sessão automaticamente — permite reconexão
        # A sessão será limpa pelo cleanup ou por nova inicialização


# ── REST endpoints ────────────────────────────────────────────────────


@router.post("/exec")
async def exec_command(body: Dict):
    """Executa um comando shell e retorna a saída.

    Request body:
    ```json
    {
        "command": "ls -la",
        "cwd": "/home/user",
        "session_id": "default",
        "timeout": 30.0
    }
    ```
    """
    command = body.get("command", "")
    cwd = body.get("cwd")
    session_id = body.get("session_id", "default")
    timeout = body.get("timeout", 30.0)

    if not command:
        return {"output": "", "exit_code": -1, "error": "No command provided"}

    result = await shell_manager.execute_command(
        session_id, command, cwd=cwd, timeout=timeout
    )
    return result


@router.get("/cwd")
async def get_cwd(session_id: str = "default"):
    """Retorna o diretório de trabalho atual da sessão."""
    cwd = await shell_manager.get_cwd(session_id)
    if cwd:
        return {"cwd": cwd}
    return {"cwd": os.path.expanduser("~")}


@router.post("/cwd")
async def set_cwd(body: Dict):
    """Define o diretório de trabalho da sessão.

    Request body:
    ```json
    {"path": "/home/user/projects", "session_id": "default"}
    ```
    """
    path = body.get("path", "")
    session_id = body.get("session_id", "default")

    if not path:
        return {"success": False, "error": "No path provided"}

    success = await shell_manager.set_cwd(session_id, path)
    if success:
        return {"success": True, "cwd": os.path.abspath(path)}
    return {"success": False, "error": f"Directory not found: {path}"}


@router.get("/which/{command:path}")
async def which_command(command: str):
    """Verifica se um comando está disponível no sistema."""
    result = shell_manager.check_command(command)
    return result


@router.post("/kill")
async def kill_process(body: Dict):
    """Encerra um processo em execução.

    Request body:
    ```json
    {"session_id": "default", "signal": "SIGTERM"}
    ```
    """
    session_id = body.get("session_id", "default")
    sig_name = body.get("signal", "SIGTERM")

    sig_map = {
        "SIGINT": signal.SIGINT,
        "SIGTERM": signal.SIGTERM,
        "SIGKILL": signal.SIGKILL,
        "SIGHUP": signal.SIGHUP,
    }
    sig = sig_map.get(sig_name, signal.SIGTERM)

    await shell_manager.kill_process(session_id, sig)
    return {"success": True, "signal": sig_name}


@router.post("/resize")
async def resize_terminal(body: Dict):
    """Redimensiona o PTY do terminal.

    Request body:
    ```json
    {"session_id": "default", "cols": 80, "rows": 24}
    ```
    """
    session_id = body.get("session_id", "default")
    cols = body.get("cols", 80)
    rows = body.get("rows", 24)

    session = shell_manager._sessions.get(session_id)
    if session:
        await session.resize_pty(cols, rows)
        return {"success": True}
    return {"success": False, "error": "Session not found"}
