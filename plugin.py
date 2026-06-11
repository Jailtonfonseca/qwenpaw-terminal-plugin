# -*- coding: utf-8 -*-
"""
QwenPaw Terminal Plugin — Backend entry point.

Registers a startup hook that mounts the terminal WebSocket router
onto the FastAPI app at application startup.
"""

import logging
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

# Plugin directory — needed for router imports
PLUGIN_DIR = Path(__file__).parent


class TerminalPlugin:
    """Terminal plugin entry point."""

    def register(self, api):
        """Register startup hook with the plugin API."""
        api.register_startup_hook(
            hook_name="terminal_init",
            callback=self._on_startup,
            priority=100,
        )
        logger.info("Terminal plugin registered startup hook")

    async def _on_startup(self):
        """Mount terminal API routers on application startup."""
        # Add plugin directory to sys.path so router imports work
        plugin_dir_str = str(PLUGIN_DIR)
        if plugin_dir_str not in sys.path:
            sys.path.insert(0, plugin_dir_str)

        try:
            from routers.terminal import router as terminal_router

            _inject_routers([terminal_router])
            logger.info("Terminal plugin: routers mounted successfully")

        except Exception as e:
            logger.error(
                "Terminal plugin: failed to mount routers: %s",
                e,
                exc_info=True,
            )


def _inject_routers(routers) -> None:
    """Inject routers into the FastAPI app, reordering catch-all routes."""
    try:
        from qwenpaw.app.main import app

        for router in routers:
            app.include_router(router, prefix="/api")

        # Move SPA catch-all to the end so our routes are matched first
        _reorder_catch_all(app)

    except Exception as e:
        logger.error(
            "Terminal plugin: failed to inject routers: %s", e, exc_info=True
        )


def _reorder_catch_all(app) -> None:
    """Move SPA catch-all route to the end of the route list."""
    try:
        catch_all_indices = [
            i
            for i, r in enumerate(app.routes)
            if getattr(r, "path", "") == "/{full_path:path}"
        ]
        if not catch_all_indices:
            return
        for idx in reversed(catch_all_indices):
            route = app.routes.pop(idx)
            app.routes.append(route)
        logger.debug("Terminal plugin: reordered catch-all route")
    except Exception as e:
        logger.debug("Terminal plugin: could not reorder catch-all: %s", e)
