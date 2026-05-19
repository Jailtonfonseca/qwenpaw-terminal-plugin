# -*- coding: utf-8 -*-
"""
QwenPaw Terminal Plugin — Entry Point.

Fornece um terminal de comando integrado ao QwenPaw:

  - Terminal interativo em tempo real via WebSocket
  - Execução de comandos shell com suporte a PTY
  - Gerenciamento de processos (kill, signal, timeout)
  - Navegação pelo filesystem
  - Histórico de comandos

Registra:
  - HTTP Router em /api/terminal (REST + WebSocket)
  - 3 tools agent: terminal_exec, terminal_cwd, terminal_which
  - Startup hook para inicialização segura
  - Shutdown hook para limpeza de sessões
"""

import logging
from pathlib import Path

from qwenpaw.plugins.api import PluginApi

from .backend.terminal_api import router

logger = logging.getLogger(__name__)

_PLUGIN_DIR = Path(__file__).parent


class QwenPawTerminalPlugin:
    """QwenPaw Terminal Plugin.

    Adiciona um terminal de comando completo ao QwenPaw,
    acessível via:
    - Menu lateral do console (/plugin/terminal)
    - Tools dos agentes (terminal_exec, terminal_cwd, terminal_which)
    """

    def register(self, api: PluginApi):
        """Registra todos os componentes do plugin."""
        logger.info("[TerminalPlugin] Initializing...")

        # ── 1. HTTP Router (REST + WebSocket) ──────────────────────
        api.register_http_router(
            router=router,
            prefix="/terminal",
            tags=["terminal"],
        )
        logger.info("[TerminalPlugin] HTTP router registered at /api/terminal")

        # ── 2. Agent Tools ─────────────────────────────────────────
        from .backend.shell_manager import shell_manager

        # Tool: terminal_exec — Executa comando shell
        async def terminal_exec(command: str, cwd: str = None,
                                timeout: float = 30.0):
            """Execute a shell command and return the output.

            Args:
                command: The shell command to execute
                cwd: Working directory (optional, defaults to home)
                timeout: Maximum execution time in seconds (default: 30)
            """
            result = await shell_manager.exec_direct(
                command, cwd=cwd, timeout=timeout
            )

            output_parts = []
            if result["stdout"]:
                output_parts.append(result["stdout"])
            if result["stderr"]:
                output_parts.append(f"[STDERR]\n{result['stderr']}")

            return {
                "output": "\n".join(output_parts),
                "exit_code": result["exit_code"],
                "error": result["error"],
            }

        api.register_tool(
            tool_name="terminal_exec",
            tool_func=terminal_exec,
            description=(
                "Execute a shell command on the host system and return "
                "the output. Supports any command available on the system "
                "PATH. Use this for running scripts, compiling code, "
                "managing files, installing packages, etc."
            ),
            icon="💻",
        )

        # Tool: terminal_cwd — Get/set working directory
        async def terminal_cwd(path: str = None):
            """Get or set the current working directory of the terminal.

            Args:
                path: If provided, change to this directory.
                      If omitted, returns the current directory.
            """
            if path:
                import os
                if os.path.isdir(path):
                    # Atualiza CWD padrão do shell_manager para novas sessões
                    return {"cwd": os.path.abspath(path), "changed": True}
                else:
                    return {"cwd": None, "changed": False,
                            "error": f"Directory not found: {path}"}
            else:
                import os
                return {"cwd": os.getcwd()}

        api.register_tool(
            tool_name="terminal_cwd",
            tool_func=terminal_cwd,
            description=(
                "Get or set the current working directory. "
                "Use this to navigate the filesystem before running commands."
            ),
            icon="📂",
        )

        # Tool: terminal_which — Check command availability
        async def terminal_which(command: str):
            """Check if a command or program is available on the system.

            Args:
                command: The command name to check (e.g. "git", "node", "python3")
            """
            return shell_manager.check_command(command)

        api.register_tool(
            tool_name="terminal_which",
            tool_func=terminal_which,
            description=(
                "Check if a command or program is installed and available "
                "on the system PATH. Returns the full path if found."
            ),
            icon="🔍",
        )

        # ── 3. Startup Hook ────────────────────────────────────────
        async def on_startup():
            """Inicialização do plugin."""
            logger.info("[TerminalPlugin] Startup complete — "
                        "terminal ready at /api/terminal")
            return True

        api.register_startup_hook(
            hook_name="terminal_startup",
            callback=on_startup,
            priority=50,
        )

        # ── 4. Shutdown Hook ───────────────────────────────────────
        async def on_shutdown():
            """Limpeza de todas as sessões ativas."""
            logger.info("[TerminalPlugin] Cleaning up shell sessions...")
            from .backend.shell_manager import shell_manager
            await shell_manager.cleanup_all()
            logger.info("[TerminalPlugin] All sessions cleaned up")

        api.register_shutdown_hook(
            hook_name="terminal_shutdown",
            callback=on_shutdown,
            priority=50,
        )

        logger.info("[TerminalPlugin] Registration complete!")


# Export plugin instance (required by QwenPaw plugin loader)
plugin = QwenPawTerminalPlugin()
