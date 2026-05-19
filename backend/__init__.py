# -*- coding: utf-8 -*-
"""
QwenPaw Terminal Plugin — Backend Package.

Fornece o gerenciamento de shell (shell_manager) e a API REST/WebSocket
(terminal_api) para o terminal integrado ao QwenPaw.
"""

from .shell_manager import shell_manager
from .terminal_api import router

__all__ = ["shell_manager", "router"]
