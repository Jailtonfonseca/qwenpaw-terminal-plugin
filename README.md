# QwenPaw Terminal Plugin

A fully functional system terminal inside your QwenPaw sidebar. Access your shell directly from the UI.

## Features

- 🖥️ **Full PTY Support** — Real pseudo-terminal (bash, zsh, sh, etc.)
- 🔌 **WebSocket Bridge** — Bidirectional streaming via WebSocket
- 🎨 **5 Themes** — Default (Tokyo Night), Dracula, Monokai, Solarized Dark, Light
- 📐 **Auto Resize** — Terminal adapts to window size
- 🔗 **Clickable Links** — URLs in terminal output are clickable
- ⚡ **Auto-Reconnect** — Reconnects automatically on disconnect
- 📋 **Copy/Paste** — Built-in copy selection support
- 🔤 **Configurable Font Size** — 10px to 24px

## Installation

1. Copy the `qwenpaw-terminal-plugin` folder to your QwenPaw plugins directory:

```bash
cp -r qwenpaw-terminal-plugin ~/.qwenpaw/plugins/
```

2. Install frontend dependencies and build:

```bash
cd ~/.qwenpaw/plugins/qwenpaw-terminal-plugin/ui
npm install
npm run build
```

3. Restart QwenPaw.

4. The **Terminal** page will appear in your sidebar.

## Architecture

```
┌─────────────────────────────────────────┐
│           QwenPaw Console UI            │
│  ┌───────────────────────────────────┐  │
│  │   xterm.js Terminal Component     │  │
│  │   (Frontend Plugin - index.ts)    │  │
│  └──────────────┬────────────────────┘  │
│                 │ WebSocket              │
└─────────────────┼───────────────────────┘
                  │
┌─────────────────┼───────────────────────┐
│           QwenPaw Backend               │
│  ┌──────────────┴────────────────────┐  │
│  │   WebSocket ↔ PTY Bridge          │  │
│  │   (routers/terminal.py)           │  │
│  └──────────────┬────────────────────┘  │
│                 │                        │
│  ┌──────────────┴────────────────────┐  │
│  │   OS PTY (pseudo-terminal)        │  │
│  │   /bin/bash, /bin/zsh, etc.       │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## WebSocket Protocol

### Client → Server

```json
{"type": "input",  "data": "ls -la\n"}
{"type": "resize", "cols": 120, "rows": 40}
{"type": "ping"}
```

### Server → Client

```json
{"type": "output", "data": "<raw terminal output>"}
{"type": "pong"}
{"type": "error",  "message": "..."}
```

Also accepts raw binary frames as terminal input/output.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/terminal/health` | Health check |
| GET | `/api/terminal/shell-info` | Default shell info |
| WS | `/api/terminal/ws` | WebSocket PTY bridge |

### WebSocket Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `shell` | string | `$SHELL` | Shell to execute |
| `cols` | int | 80 | Initial columns |
| `rows` | int | 24 | Initial rows |
| `cwd` | string | `$HOME` | Initial working directory |

## License

MIT
