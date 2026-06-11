# -*- coding: utf-8 -*-
"""
QwenPaw Terminal Plugin — Backend entry point.

Mounts the terminal WebSocket router and registers the plugin
with the QwenPaw system.
"""

import logging

logger = logging.getLogger(__name__)


def mount_routers() -> None:
    """Mount terminal API routers onto the FastAPI app."""
    try:
        from routers.terminal import router as terminal_router

        _inject_routers([terminal_router])
        logger.info("Terminal plugin routers mounted successfully")

    except Exception as e:
        logger.error(
            "Failed to mount terminal plugin routers: %s",
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
        logger.error("Failed to inject routers: %s", e, exc_info=True)


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
        logger.debug("Reordered catch-all route")
    except Exception as e:
        logger.debug("Could not reorder catch-all: %s", e)
