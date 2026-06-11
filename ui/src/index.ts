/**
 * QwenPaw Terminal Plugin — Frontend Entry
 *
 * Registers a "Terminal" page in the QwenPaw sidebar with a fully
 * functional xterm.js terminal connected via WebSocket to the backend PTY bridge.
 *
 * Uses window.QwenPaw plugin API.
 */

// ── Inject xterm CSS at runtime (single-file bundle) ─────────────────────

function injectXtermStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById("qwenpaw-terminal-xterm-css")) return;

  const CSS = `
.xterm{padding:0}
.xterm-viewport::-webkit-scrollbar{width:10px;height:10px}
.xterm-viewport::-webkit-scrollbar-thumb{background:rgba(100,100,100,.5);border-radius:5px;border:2px solid transparent;background-clip:content-box}
.xterm-viewport::-webkit-scrollbar-track{background:rgba(0,0,0,.2)}
.xterm-viewport::-webkit-scrollbar-corner{background:rgba(0,0,0,.2)}
.xterm .xterm-screen{position:relative}
.xterm .xterm-screen canvas{position:absolute;left:0;top:0}
.xterm .xterm-viewport{position:absolute;top:0;right:0;bottom:0;left:0;overflow-y:auto!important}
.xterm .xterm-viewport::-webkit-scrollbar{display:none}
.xterm .xterm-viewport textarea{position:fixed;top:-9999px;left:-9999px;opacity:0;width:0;height:0}
.xterm .xterm-accessibility-tree{position:absolute;overflow:hidden;width:1px;height:1px;top:-9999px}
.xterm .xterm-composition{position:absolute;left:0;top:0;z-index:-1}
.xterm .xterm-composing-underline{text-decoration:underline}
.xterm .xterm-cursor-layer{z-index:4}
.xterm .xterm-selection-layer{z-index:3;pointer-events:none}
.xterm .xterm-overlay-layer{z-index:2}
.xterm .xterm-render-layer{z-index:1}
.xterm .xterm-viewport{-ms-overflow-style:none;scrollbar-width:none}
.xterm .xterm-viewport::-webkit-scrollbar{display:none}
.xterm .xterm-rows{position:relative}
.xterm .xterm-row{white-space:nowrap}
.xterm .xterm-fg-0{color:#000}
.xterm .xterm-fg-1{color:#c91b00}
.xterm .xterm-fg-2{color:#00c200}
.xterm .xterm-fg-3{color:#c7c400}
.xterm .xterm-fg-4{color:#0037da}
.xterm .xterm-fg-5{color:#c930c7}
.xterm .xterm-fg-6{color:#00c5c7}
.xterm .xterm-fg-7{color:#c7c7c7}
.xterm .xterm-fg-8{color:#686868}
.xterm .xterm-fg-9{color:#ff6e67}
.xterm .xterm-fg-10{color:#5ffa68}
.xterm .xterm-fg-11{color:#fffc67}
.xterm .xterm-fg-12{color:#6871ff}
.xterm .xterm-fg-13{color:#ff76ff}
.xterm .xterm-fg-14{color:#5ffdff}
.xterm .xterm-fg-15{color:#feffff}
.xterm .xterm-bg-0{background-color:#000}
.xterm .xterm-bg-1{background-color:#c91b00}
.xterm .xterm-bg-2{background-color:#00c200}
.xterm .xterm-bg-3{background-color:#c7c400}
.xterm .xterm-bg-4{background-color:#0037da}
.xterm .xterm-bg-5{background-color:#c930c7}
.xterm .xterm-bg-6{background-color:#00c5c7}
.xterm .xterm-bg-7{background-color:#c7c7c7}
.xterm .xterm-bg-8{background-color:#686868}
.xterm .xterm-bg-9{background-color:#ff6e67}
.xterm .xterm-bg-10{background-color:#5ffa68}
.xterm .xterm-bg-11{background-color:#fffc67}
.xterm .xterm-bg-12{background-color:#6871ff}
.xterm .xterm-bg-13{background-color:#ff76ff}
.xterm .xterm-bg-14{background-color:#5ffdff}
.xterm .xterm-bg-15{background-color:#feffff}
`;

  const style = document.createElement("style");
  style.id = "qwenpaw-terminal-xterm-css";
  style.textContent = CSS;
  document.head.appendChild(style);
}

injectXtermStyles();

// ── Dynamic imports for xterm addons (loaded at runtime) ─────────────────

async function loadXterm() {
  const [{ Terminal }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
    import("@xterm/xterm"),
    import("@xterm/addon-fit"),
    import("@xterm/addon-web-links"),
  ]);
  return { Terminal, FitAddon, WebLinksAddon };
}

// ── Plugin builder ───────────────────────────────────────────────────────

function buildPlugin() {
  const { React, antd, antdIcons, getApiUrl, getApiToken } = (window as any)
    .QwenPaw.host;

  const {
    Card,
    Space,
    Button,
    Tag,
    Typography,
    Switch,
    Tooltip,
    Select,
    message: antdMessage,
  } = antd;

  const {
    CodeOutlined,
    ReloadOutlined,
    ClearOutlined,
    CopyOutlined,
    ExpandOutlined,
    ShrinkOutlined,
    InfoCircleOutlined,
  } = antdIcons || {};

  const { useState, useEffect, useRef, useCallback } = React;
  const { Text, Title } = Typography;

  // ── Themes ─────────────────────────────────────────────────────────

  const THEMES: Record<string, any> = {
    default: {
      background: "#1a1b26",
      foreground: "#a9b1d6",
      cursor: "#c0caf5",
      cursorAccent: "#1a1b26",
      selectionBackground: "#33467c",
      black: "#15161e",
      red: "#f7768e",
      green: "#9ece6a",
      yellow: "#e0af68",
      blue: "#7aa2f7",
      magenta: "#bb9af7",
      cyan: "#7dcfff",
      white: "#a9b1d6",
      brightBlack: "#414868",
      brightRed: "#f7768e",
      brightGreen: "#9ece6a",
      brightYellow: "#e0af68",
      brightBlue: "#7aa2f7",
      brightMagenta: "#bb9af7",
      brightCyan: "#7dcfff",
      brightWhite: "#c0caf5",
    },
    dracula: {
      background: "#282a36",
      foreground: "#f8f8f2",
      cursor: "#f8f8f2",
      cursorAccent: "#282a36",
      selectionBackground: "#44475a",
      black: "#21222c",
      red: "#ff5555",
      green: "#50fa7b",
      yellow: "#f1fa8c",
      blue: "#bd93f9",
      magenta: "#ff79c6",
      cyan: "#8be9fd",
      white: "#f8f8f2",
      brightBlack: "#6272a4",
      brightRed: "#ff6e6e",
      brightGreen: "#69ff94",
      brightYellow: "#ffffa5",
      brightBlue: "#d6acff",
      brightMagenta: "#ff92df",
      brightCyan: "#a4ffff",
      brightWhite: "#ffffff",
    },
    monokai: {
      background: "#272822",
      foreground: "#f8f8f2",
      cursor: "#f8f8f0",
      cursorAccent: "#272822",
      selectionBackground: "#49483e",
      black: "#272822",
      red: "#f92672",
      green: "#a6e22e",
      yellow: "#f4bf75",
      blue: "#66d9ef",
      magenta: "#ae81ff",
      cyan: "#a1efe4",
      white: "#f8f8f2",
      brightBlack: "#75715e",
      brightRed: "#f92672",
      brightGreen: "#a6e22e",
      brightYellow: "#f4bf75",
      brightBlue: "#66d9ef",
      brightMagenta: "#ae81ff",
      brightCyan: "#a1efe4",
      brightWhite: "#f9f8f5",
    },
    solarized_dark: {
      background: "#002b36",
      foreground: "#839496",
      cursor: "#839496",
      cursorAccent: "#002b36",
      selectionBackground: "#073642",
      black: "#073642",
      red: "#dc322f",
      green: "#859900",
      yellow: "#b58900",
      blue: "#268bd2",
      magenta: "#d33682",
      cyan: "#2aa198",
      white: "#eee8d5",
      brightBlack: "#586e75",
      brightRed: "#cb4b16",
      brightGreen: "#586e75",
      brightYellow: "#657b83",
      brightBlue: "#839496",
      brightMagenta: "#6c71c4",
      brightCyan: "#93a1a1",
      brightWhite: "#fdf6e3",
    },
    light: {
      background: "#ffffff",
      foreground: "#383a42",
      cursor: "#526fff",
      cursorAccent: "#ffffff",
      selectionBackground: "#bfceff",
      black: "#383a42",
      red: "#e45649",
      green: "#50a14f",
      yellow: "#c18401",
      blue: "#4078f2",
      magenta: "#a626a4",
      cyan: "#0184bc",
      white: "#a0a1a7",
      brightBlack: "#696c77",
      brightRed: "#e06c75",
      brightGreen: "#98c379",
      brightYellow: "#d19a66",
      brightBlue: "#61afef",
      brightMagenta: "#c678dd",
      brightCyan: "#56b6c2",
      brightWhite: "#ffffff",
    },
  };

  // ── Terminal Component ─────────────────────────────────────────────

  function TerminalPage() {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<any>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const fitAddonRef = useRef<any>(null);
    const reconnectTimerRef = useRef<any>(null);

    const [connected, setConnected] = useState(false);
    const [theme, setTheme] = useState("default");
    const [fontSize, setFontSize] = useState(14);
    const [shellInfo, setShellInfo] = useState<any>(null);

    const getWsUrl = useCallback(() => {
      const base = getApiUrl("terminal/ws");
      return base.replace(/^http/, "ws");
    }, []);

    const getToken = useCallback(() => {
      return getApiToken() || "";
    }, []);

    // Initialize xterm
    useEffect(() => {
      if (!terminalRef.current || xtermRef.current) return;

      let disposed = false;

      (async () => {
        const { Terminal, FitAddon, WebLinksAddon } = await loadXterm();
        if (disposed) return;

        const term = new Terminal({
          theme: THEMES[theme],
          fontSize,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', Menlo, Consolas, monospace",
          fontWeight: "400",
          fontWeightBold: "700",
          lineHeight: 1.2,
          cursorBlink: true,
          cursorStyle: "bar",
          cursorWidth: 2,
          scrollback: 10000,
          tabStopWidth: 4,
          allowProposedApi: true,
          convertEol: false,
          scrollOnUserInput: true,
        });

        const fitAddon = new FitAddon();
        const webLinksAddon = new WebLinksAddon();

        term.loadAddon(fitAddon);
        term.loadAddon(webLinksAddon);

        term.open(terminalRef.current);
        fitAddon.fit();

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        // Connect to WebSocket
        connectWebSocket(term);

        // Handle user input → WebSocket
        term.onData((data: string) => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({ type: "input", data })
            );
          }
        });

        // Handle binary input
        term.onBinary((data: string) => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            const buffer = new Uint8Array(data.length);
            for (let i = 0; i < data.length; i++) {
              buffer[i] = data.charCodeAt(i) & 0xff;
            }
            wsRef.current.send(buffer);
          }
        });

        // Fit on window resize
        const onResize = () => {
          fitAddon.fit();
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                type: "resize",
                cols: term.cols,
                rows: term.rows,
              })
            );
          }
        };
        window.addEventListener("resize", onResize);

        // Also handle container resize via ResizeObserver
        const resizeObserver = new ResizeObserver(() => {
          setTimeout(onResize, 50);
        });
        resizeObserver.observe(terminalRef.current);

        return () => {
          window.removeEventListener("resize", onResize);
          resizeObserver.disconnect();
        };
      })();

      return () => {
        disposed = true;
        if (wsRef.current) {
          wsRef.current.close();
        }
        if (xtermRef.current) {
          xtermRef.current.dispose();
          xtermRef.current = null;
        }
      };
    }, []);

    // Connect WebSocket to PTY bridge
    const connectWebSocket = useCallback(
      (term: any) => {
        if (wsRef.current) {
          wsRef.current.close();
        }

        const wsUrl = getWsUrl();
        const token = getToken();
        const url = token
          ? `${wsUrl}?cols=${term.cols}&rows=${term.rows}&token=${token}`
          : `${wsUrl}?cols=${term.cols}&rows=${term.rows}`;

        const ws = new WebSocket(url);
        ws.binaryType = "arraybuffer";
        wsRef.current = ws;

        ws.onopen = () => {
          setConnected(true);
          term.focus();
        };

        ws.onmessage = (event: MessageEvent) => {
          if (event.data instanceof ArrayBuffer) {
            // Binary data → terminal output
            const text = new TextDecoder().decode(event.data);
            term.write(text);
          } else if (typeof event.data === "string") {
            try {
              const msg = JSON.parse(event.data);
              if (msg.type === "error") {
                term.writeln(`\r\n\x1b[31m[Error] ${msg.message}\x1b[0m`);
              } else if (msg.type === "pong") {
                // Pong received
              }
            } catch {
              // Plain text
              term.write(event.data);
            }
          }
        };

        ws.onclose = () => {
          setConnected(false);
          term.writeln(
            "\r\n\x1b[33m[Disconnected] Reconnecting in 3s...\x1b[0m"
          );
          // Auto-reconnect
          reconnectTimerRef.current = setTimeout(() => {
            connectWebSocket(term);
          }, 3000);
        };

        ws.onerror = () => {
          // onclose will fire after onerror
        };
      },
      [getWsUrl, getToken]
    );

    // Update theme
    useEffect(() => {
      if (xtermRef.current) {
        xtermRef.current.options.theme = THEMES[theme];
      }
    }, [theme]);

    // Update font size
    useEffect(() => {
      if (xtermRef.current) {
        xtermRef.current.options.fontSize = fontSize;
        fitAddonRef.current?.fit();
      }
    }, [fontSize]);

    // Fetch shell info
    useEffect(() => {
      (async () => {
        try {
          const token = getApiToken();
          const headers: Record<string, string> = {};
          if (token) headers["Authorization"] = `Bearer ${token}`;
          const res = await fetch(getApiUrl("terminal/shell-info"), {
            headers,
          });
          if (res.ok) {
            setShellInfo(await res.json());
          }
        } catch {}
      })();
    }, []);

    // Actions
    const handleClear = useCallback(() => {
      xtermRef.current?.clear();
    }, []);

    const handleCopy = useCallback(() => {
      const selection = xtermRef.current?.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection).then(() => {
          antdMessage.success("Copied to clipboard");
        });
      } else {
        antdMessage.info("No selection to copy");
      }
    }, []);

    const handleReconnect = useCallback(() => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (xtermRef.current) {
        connectWebSocket(xtermRef.current);
      }
    }, [connectWebSocket]);

    const handleFit = useCallback(() => {
      fitAddonRef.current?.fit();
    }, []);

    return React.createElement(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          height: "100%",
          background: "#1a1b26",
        },
      },
      // ── Toolbar ──────────────────────────────────────────────
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 16px",
            background: "#16161e",
            borderBottom: "1px solid #33467c",
            flexShrink: 0,
          },
        },
        React.createElement(
          Space,
          { size: "middle" },
          React.createElement(CodeOutlined, { style: { color: "#7aa2f7", fontSize: 18 } }),
          React.createElement(
            Text,
            { strong: true, style: { color: "#c0caf5", fontSize: 14 } },
            "Terminal"
          ),
          React.createElement(
            Tag,
            {
              color: connected ? "green" : "red",
              style: { marginLeft: 4 },
            },
            connected ? "● Connected" : "○ Disconnected"
          )
        ),
        React.createElement(
          Space,
          { size: "small" },
          React.createElement(
            Select,
            {
              size: "small",
              value: theme,
              onChange: setTheme,
              style: { width: 140 },
              options: Object.keys(THEMES).map((k) => ({
                value: k,
                label: k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
              })),
            }
          ),
          React.createElement(
            Select,
            {
              size: "small",
              value: fontSize,
              onChange: setFontSize,
              style: { width: 70 },
              options: [10, 12, 13, 14, 15, 16, 18, 20, 22, 24].map((s) => ({
                value: s,
                label: `${s}px`,
              })),
            }
          ),
          React.createElement(
            Tooltip,
            { title: "Clear" },
            React.createElement(Button, {
              size: "small",
              icon: React.createElement(ClearOutlined),
              onClick: handleClear,
            })
          ),
          React.createElement(
            Tooltip,
            { title: "Copy Selection" },
            React.createElement(Button, {
              size: "small",
              icon: React.createElement(CopyOutlined),
              onClick: handleCopy,
            })
          ),
          React.createElement(
            Tooltip,
            { title: "Fit to Window" },
            React.createElement(Button, {
              size: "small",
              icon: React.createElement(ExpandOutlined),
              onClick: handleFit,
            })
          ),
          React.createElement(
            Tooltip,
            { title: "Reconnect" },
            React.createElement(Button, {
              size: "small",
              icon: React.createElement(ReloadOutlined),
              onClick: handleReconnect,
            })
          )
        )
      ),
      // ── Terminal Container ────────────────────────────────────
      React.createElement("div", {
        ref: terminalRef,
        style: {
          flex: 1,
          padding: "4px 0 0 4px",
          overflow: "hidden",
        },
      }),
      // ── Status Bar ───────────────────────────────────────────
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "4px 16px",
            background: "#16161e",
            borderTop: "1px solid #33467c",
            flexShrink: 0,
          },
        },
        React.createElement(
          Space,
          { size: "middle" },
          shellInfo &&
            React.createElement(
              Text,
              { style: { color: "#565f89", fontSize: 12 } },
              `${shellInfo.user}@${shellInfo.shell}`
            ),
          shellInfo &&
            React.createElement(
              Text,
              { style: { color: "#565f89", fontSize: 12 } },
              shellInfo.cwd
            )
        ),
        React.createElement(
          Text,
          { style: { color: "#565f89", fontSize: 12 } },
          `xterm.js v5 — ${xtermRef.current?.cols || 80}×${xtermRef.current?.rows || 24}`
        )
      )
    );
  }

  // ── Register Routes ────────────────────────────────────────────

  (window as any).QwenPaw.registerRoutes(
    "qwenpaw-terminal-plugin",
    [
      {
        path: "/plugin/qwenpaw-terminal-plugin/terminal",
        component: TerminalPage,
        label: "Terminal",
        icon: ">_",
        priority: 100,
      },
    ]
  );
}

// ── Self-executing entry point ────────────────────────────────────────

buildPlugin();
