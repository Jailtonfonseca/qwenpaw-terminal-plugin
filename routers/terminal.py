# -*- coding: utf-8 -*-
"""WebSocket terminal bridge — PTY ↔ xterm.js.

Endpoints:
    GET  /terminal/health          – health check
    WS   /terminal/ws              – bidirectional PTY bridge
    GET  /terminal/shell-info      – default shell information
"""

from __future__ import annotations

import asyncio
import fcntl
import json
import logging
import os
import pty
import select
import signal
import struct
import termios
from typing import Optional

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/terminal", tags=["terminal"])


# ── Health endpoint ──────────────────────────────────────────────────────


@router.get("/health")
async def health_check() -> dict:
    """Simple health check for the terminal plugin."""
    return {
        "status": "ok",
        "plugin": "qwenpaw-terminal-plugin",
        "version": "1.0.0",
    }


# ── Shell info endpoint ──────────────────────────────────────────────────


@router.get("/shell-info")
async def shell_info() -> dict:
    """Return information about the default shell."""
    shell = os.environ.get("SHELL", "/bin/sh")
    user = os.environ.get("USER", "root")
    home = os.environ.get("HOME", "/root")
    return {
        "shell": shell,
        "user": user,
        "home": home,
        "cwd": os.getcwd(),
    }


# ── WebSocket PTY bridge ─────────────────────────────────────────────────


def _set_nonblocking(fd: int) -> None:
    """Set a file descriptor to non-blocking mode."""
    flags = fcntl.fcntl(fd, fcntl.F_GETFL)
    fcntl.fcntl(fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)


def _get_default_shell() -> str:
    """Get the default shell for the current user."""
    return os.environ.get("SHELL", "/bin/sh")


def _get_initial_env() -> dict:
    """Build an environment dict for the child process."""
    env = os.environ.copy()
    env["TERM"] = "xterm-256color"
    env["COLORTERM"] = "truecolor"
    env["LANG"] = "en_US.UTF-8"
    env["LC_ALL"] = "en_US.UTF-8"
    env["LINES"] = "24"
    env["COLUMNS"] = "80"
    return env


@router.websocket("/ws")
async def terminal_websocket(
    websocket: WebSocket,
    shell: Optional[str] = Query(default=None),
    cols: int = Query(default=80),
    rows: int = Query(default=24),
    cwd: Optional[str] = Query(default=None),
) -> None:
    """
    Bidirectional WebSocket ↔ PTY bridge.

    Protocol (JSON messages):
        Client → Server:
            {"type": "input",  "data": "<raw terminal input>"}
            {"type": "resize", "cols": 120, "rows": 40}
            {"type": "ping"}

        Server → Client:
            {"type": "output", "data": "<raw terminal output>"}
            {"type": "pong"}
            {"type": "error",  "message": "..."}

    Also accepts raw binary frames as terminal input.
    """
    await websocket.accept()
    logger.info(
        "Terminal WebSocket connected: cols=%d rows=%d", cols, rows
    )

    shell_cmd = shell or _get_default_shell()
    env = _get_initial_env()
    env["LINES"] = str(rows)
    env["COLUMNS"] = str(cols)

    master_fd: Optional[int] = None
    child_pid: Optional[int] = None
    read_task: Optional[asyncio.Task] = None

    try:
        # Fork a new PTY
        child_pid, master_fd = pty.fork()

        if child_pid == 0:
            # ── Child process ────────────────────────────────────────
            winsize = struct.pack("HHHH", rows, cols, 0, 0)
            fcntl.ioctl(
                termios.STDOUT_FILENO,
                termios.TIOCSWINSZ,
                winsize,
            )

            target_cwd = cwd or os.environ.get("HOME", "/root")
            try:
                os.chdir(target_cwd)
            except OSError:
                os.chdir("/")

            os.execvpe(
                shell_cmd,
                [shell_cmd, "--login"],
                env,
            )

        # ── Parent process ───────────────────────────────────────────
        winsize = struct.pack("HHHH", rows, cols, 0, 0)
        fcntl.ioctl(master_fd, termios.TIOCSWINSZ, winsize)
        _set_nonblocking(master_fd)

        loop = asyncio.get_event_loop()

        async def pty_reader() -> None:
            """Read PTY output and send to WebSocket."""
            try:
                while True:
                    await loop.run_in_executor(
                        None,
                        lambda: select.select([master_fd], [], [], 0.1),
                    )

                    try:
                        data = os.read(master_fd, 65536)
                        if not data:
                            break
                        await websocket.send_bytes(data)
                    except OSError:
                        await asyncio.sleep(0.01)
                        continue
            except asyncio.CancelledError:
                pass
            except Exception as e:
                logger.debug("PTY reader error: %s", e)

        read_task = asyncio.create_task(pty_reader())

        # ── Main loop: read from WebSocket, write to PTY ─────────────
        try:
            while True:
                message = await websocket.receive()

                msg_type = message.get("type", "")

                if msg_type == "websocket.receive":
                    if "text" in message:
                        try:
                            data = json.loads(message["text"])
                            action = data.get("type", "")

                            if action == "input":
                                input_data = data.get("data", "")
                                if input_data and master_fd is not None:
                                    os.write(
                                        master_fd,
                                        input_data.encode("utf-8"),
                                    )

                            elif action == "resize":
                                new_cols = data.get("cols", cols)
                                new_rows = data.get("rows", rows)
                                if master_fd is not None:
                                    winsize = struct.pack(
                                        "HHHH", new_rows, new_cols, 0, 0
                                    )
                                    fcntl.ioctl(
                                        master_fd,
                                        termios.TIOCSWINSZ,
                                        winsize,
                                    )
                                    cols = new_cols
                                    rows = new_rows
                                    logger.debug(
                                        "Terminal resized: %dx%d",
                                        new_cols,
                                        new_rows,
                                    )

                            elif action == "ping":
                                await websocket.send_text(
                                    json.dumps({"type": "pong"})
                                )

                        except json.JSONDecodeError:
                            if master_fd is not None:
                                os.write(
                                    master_fd,
                                    message["text"].encode("utf-8"),
                                )

                    elif "bytes" in message:
                        if master_fd is not None:
                            os.write(master_fd, message["bytes"])

                elif msg_type == "websocket.disconnect":
                    break

        except WebSocketDisconnect:
            logger.info("Terminal WebSocket disconnected")
        except Exception as e:
            logger.error("Terminal WebSocket error: %s", e, exc_info=True)

    except Exception as e:
        logger.error("Terminal setup error: %s", e, exc_info=True)
        try:
            await websocket.send_text(
                json.dumps({"type": "error", "message": str(e)})
            )
        except Exception:
            pass

    finally:
        if read_task and not read_task.done():
            read_task.cancel()
            try:
                await read_task
            except asyncio.CancelledError:
                pass

        if child_pid is not None:
            try:
                os.kill(child_pid, signal.SIGTERM)
                await asyncio.sleep(0.1)
                try:
                    os.kill(child_pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                os.waitpid(child_pid, os.WNOHANG)
            except ProcessLookupError:
                pass
            except Exception as e:
                logger.debug("Child cleanup error: %s", e)

        if master_fd is not None:
            try:
                os.close(master_fd)
            except OSError:
                pass

        logger.info("Terminal session cleaned up")
