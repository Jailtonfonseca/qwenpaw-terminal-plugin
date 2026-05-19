/**
 * QwenPaw Terminal — Frontend Plugin Entry
 *
 * Registra uma página de terminal no menu lateral do QwenPaw Console.
 *
 * A página fornece um terminal completo com:
 * - xterm.js para emulação de terminal
 * - WebSocket para comunicação bidirecional em tempo real
 * - Suporte a cores, resize, scroll, seleção
 * - Ctrl+C / signals
 * - Histórico de comandos
 * - Múltiplas abas/sessões
 */

(function () {
  const QwenPaw = (window as any).QwenPaw;
  if (!QwenPaw) {
    console.error("[QwenPaw Terminal] QwenPaw host API not found");
    return;
  }

  const { React, antd, antdIcons, getApiUrl, getApiToken } = QwenPaw.host;
  const {
    Card,
    Typography,
    Space,
    Button,
    Select,
    Tag,
    Tooltip,
    message: antdMessage,
    Dropdown,
    Input,
    Modal,
    Spin,
  } = antd;
  const { Text, Title } = Typography;
  const { useState, useEffect, useRef, useCallback } = React;
  const {
    TerminalOutlined,
    ReloadOutlined,
    FullscreenOutlined,
    FullscreenExitOutlined,
    PlusOutlined,
    DeleteOutlined,
    SettingOutlined,
    InfoCircleOutlined,
  } = antdIcons || {};

  // ── XTerm CSS (auto-inject) ──────────────────────────────────────────

  function injectTerminalStyles() {
    const styleId = "qwenpaw-terminal-xterm-css";
    if (document.getElementById(styleId)) return;

    const link = document.createElement("link");
    link.id = styleId;
    link.rel = "stylesheet";
    link.href =
      "https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css";
    document.head.appendChild(link);
  }

  // ── Terminal Session ─────────────────────────────────────────────────

  class TerminalSession {
    public element: HTMLDivElement | null = null;
    public term: any = null;
    public fitAddon: any = null;
    public ws: WebSocket | null = null;
    public sessionId: string;
    public cwd: string;
    public onDisconnect: (() => void) | null = null;
    public onReconnect: (() => void) | null = null;
    private _reconnectAttempts = 0;
    private _maxReconnectAttempts = 5;
    private _wsUrl: string;
    private _pendingOutput: string[] = [];

    constructor(sessionId: string, cwd: string) {
      this.sessionId = sessionId;
      this.cwd = cwd;
      // Constrói URL do WebSocket
      const apiUrl = getApiUrl("/terminal/ws");
      this._wsUrl = apiUrl
        .replace(/^http:/, "ws:")
        .replace(/^https:/, "wss:");
    }

    async mount(container: HTMLDivElement) {
      this.element = container;

      // Carrega xterm.js dinamicamente
      const XTerm = await importXterm();
      if (!XTerm) {
        antdMessage.error("Falha ao carregar xterm.js");
        return;
      }

      const { Terminal } = XTerm;
      const { FitAddon } = await import(
        "https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/+esm"
      );
      const { WebLinksAddon } = await import(
        "https://cdn.jsdelivr.net/npm/@xterm/addon-web-links@0.11.0/+esm"
      );

      // Cria terminal
      this.term = new Terminal({
        cursorBlink: true,
        cursorStyle: "block",
        fontSize: 14,
        fontFamily:
          "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Menlo', 'Monaco', monospace",
        lineHeight: 1.3,
        allowTransparency: true,
        theme: {
          background: "#1a1b26",
          foreground: "#a9b1d6",
          cursor: "#c0caf5",
          selectionBackground: "#33467c",
          black: "#414868",
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
        allowProposedApi: true,
        convertEol: true,
        scrollback: 5000,
      });

      // Addons
      this.fitAddon = new FitAddon();
      this.term.loadAddon(this.fitAddon);
      this.term.loadAddon(new WebLinksAddon());

      // Abre no container
      this.term.open(container);
      setTimeout(() => this.fitAddon.fit(), 50);

      // Conecta WebSocket
      this.connectWebSocket();

      // Input handler
      this.term.onData((data: string) => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(
            JSON.stringify({ type: "input", data })
          );
        }
      });

      // Resize handler
      const resizeObserver = new ResizeObserver(() => {
        try {
          this.fitAddon.fit();
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const dims = this.fitAddon.proposeDimensions();
            if (dims) {
              this.ws.send(
                JSON.stringify({
                  type: "resize",
                  cols: dims.cols,
                  rows: dims.rows,
                })
              );
            }
          }
        } catch (e) {
          // ignore
        }
      });
      resizeObserver.observe(container);

      // Teclas especiais
      this.term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
        // Ctrl+Shift+C = copy
        if (e.ctrlKey && e.shiftKey && e.key === "C") {
          const selection = this.term.getSelection();
          if (selection) {
            navigator.clipboard.writeText(selection);
            return false;
          }
        }
        // Ctrl+Shift+V = paste
        if (e.ctrlKey && e.shiftKey && e.key === "V") {
          navigator.clipboard.readText().then((text) => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              this.ws.send(
                JSON.stringify({ type: "input", data: text })
              );
            }
          });
          return false;
        }
        return true;
      });

      // Escreve mensagem de boas-vindas
      this.writeWelcome();
    }

    private writeWelcome() {
      const lines = [
        `\x1b[36m╔════════════════════════════════════════════════════╗\x1b[0m`,
        `\x1b[36m║\x1b[0m  \x1b[1;33mQwenPaw Terminal v1.0.0\x1b[0m                        \x1b[36m║\x1b[0m`,
        `\x1b[36m║\x1b[0m  \x1b[90mTerminal interativo com acesso total ao sistema\x1b[0m   \x1b[36m║\x1b[0m`,
        `\x1b[36m║\x1b[0m                                                     \x1b[36m║\x1b[0m`,
        `\x1b[36m║\x1b[0m  \x1b[32m📁\x1b[0m \x1b[37mCWD:\x1b[0m \x1b[35m${this.cwd}\x1b[0m                    \x1b[36m║\x1b[0m`,
        `\x1b[36m║\x1b[0m  \x1b[32m🔌\x1b[0m \x1b[37mSocket:\x1b[0m \x1b[35mconectando...\x1b[0m               \x1b[36m║\x1b[0m`,
        `\x1b[36m╚════════════════════════════════════════════════════╝\x1b[0m`,
        ``,
        `\x1b[90mDicas: Ctrl+Shift+C copiar | Ctrl+Shift+V colar | Ctrl+C interrompe\x1b[0m`,
        ``,
      ];
      this.term.writeln(lines.join("\r\n"));
    }

    private connectWebSocket() {
      try {
        // Adiciona token de autenticação
        const token = getApiToken();
        const url = token
          ? `${this._wsUrl}?token=${encodeURIComponent(token)}`
          : this._wsUrl;

        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          this._reconnectAttempts = 0;
          // Handshake
          this.ws!.send(
            JSON.stringify({
              type: "init",
              session_id: this.sessionId,
              cwd: this.cwd,
            })
          );
          if (this.onReconnect) this.onReconnect();
        };

        this.ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);

            switch (msg.type) {
              case "init_ack":
                this.cwd = msg.cwd;
                // Atualiza linha de status (se houver barra)
                break;

              case "output":
                if (this.term) {
                  this.term.write(msg.data);
                }
                break;

              case "exec_result":
                if (this.term) {
                  this.term.write(
                    `\r\n\x1b[90m[exit: ${msg.exit_code}]\x1b[0m\r\n`
                  );
                }
                break;

              case "error":
                if (this.term) {
                  this.term.writeln(
                    `\r\n\x1b[31mError: ${msg.message}\x1b[0m`
                  );
                }
                break;

              case "pong":
                // keepalive
                break;

              default:
                break;
            }
          } catch (e) {
            // raw data not JSON
          }
        };

        this.ws.onclose = () => {
          if (this.term) {
            this.term.writeln(
              `\r\n\x1b[33m⚠️  Conexão perdida. Tentando reconectar...\x1b[0m`
            );
          }
          if (this.onDisconnect) this.onDisconnect();
          this.attemptReconnect();
        };

        this.ws.onerror = (err) => {
          console.error("[Terminal] WebSocket error:", err);
        };
      } catch (e) {
        console.error("[Terminal] Failed to create WebSocket:", e);
      }
    }

    private attemptReconnect() {
      if (this._reconnectAttempts >= this._maxReconnectAttempts) {
        if (this.term) {
          this.term.writeln(
            `\r\n\x1b[31m✕ Falha na reconexão após ${this._maxReconnectAttempts} tentativas.\x1b[0m`
          );
          this.term.writeln(
            `\x1b[33mRecarregue a página ou clique em "Reconectar".\x1b[0m`
          );
        }
        return;
      }

      this._reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this._reconnectAttempts), 10000);

      if (this.term) {
        this.term.writeln(
          `\r\n\x1b[90mTentativa ${this._reconnectAttempts}/${this._maxReconnectAttempts} em ${delay / 1000}s...\x1b[0m`
        );
      }

      setTimeout(() => {
        if (this.ws) {
          this.ws.close();
          this.ws = null;
        }
        this.connectWebSocket();
      }, delay);
    }

    reconnect() {
      this._reconnectAttempts = 0;
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
      this.connectWebSocket();
    }

    sendSignal(signal: string) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "signal", signal }));
      }
    }

    fit() {
      try {
        if (this.fitAddon) {
          this.fitAddon.fit();
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const dims = this.fitAddon.proposeDimensions();
            if (dims) {
              this.ws.send(
                JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows })
              );
            }
          }
        }
      } catch (e) {
        // ignore
      }
    }

    destroy() {
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
      if (this.term) {
        this.term.dispose();
        this.term = null;
      }
      this.fitAddon = null;
      if (this.element) {
        this.element.innerHTML = "";
        this.element = null;
      }
    }
  }

  // ── Lazy import xterm ────────────────────────────────────────────────

  let xtermPromise: Promise<any> | null = null;

  async function importXterm(): Promise<any> {
    if ((window as any).__QWENPAW_TERMINAL_XTERM) {
      return (window as any).__QWENPAW_TERMINAL_XTERM;
    }
    if (!xtermPromise) {
      xtermPromise = (async () => {
        const mod = await import(
          "https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/+esm"
        );
        (window as any).__QWENPAW_TERMINAL_XTERM = mod;
        return mod;
      })();
    }
    return xtermPromise;
  }

  // ── Terminal Page Component ──────────────────────────────────────────

  function TerminalPage() {
    const containerRef = useRef<HTMLDivElement>(null);
    const sessionRef = useRef<TerminalSession | null>(null);
    const [connected, setConnected] = useState(false);
    const [fullscreen, setFullscreen] = useState(false);
    const [sessions, setSessions] = useState([
      { id: "default", label: "default", active: true },
    ]);
    const [activeSession, setActiveSession] = useState("default");

    // Mount
    useEffect(() => {
      injectTerminalStyles();
      return () => {
        if (sessionRef.current) {
          sessionRef.current.destroy();
          sessionRef.current = null;
        }
      };
    }, []);

    // Session change
    useEffect(() => {
      if (!containerRef.current) return;

      // Destroy current session
      if (sessionRef.current) {
        sessionRef.current.destroy();
        sessionRef.current = null;
      }

      // Create new session
      const session = new TerminalSession(activeSession, "~");
      session.onDisconnect = () => setConnected(false);
      session.onReconnect = () => setConnected(true);

      session.mount(containerRef.current).then(() => {
        setConnected(true);
        setTimeout(() => session.fit(), 100);
      });

      sessionRef.current = session;

      // Window resize handler
      const handleResize = () => session.fit();
      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
      };
    }, [activeSession]);

    // Fullscreen toggle
    const toggleFullscreen = useCallback(() => {
      setFullscreen((prev) => !prev);
      setTimeout(() => {
        if (sessionRef.current) sessionRef.current.fit();
      }, 200);
    }, []);

    // Reconnect
    const handleReconnect = useCallback(() => {
      if (sessionRef.current) {
        sessionRef.current.reconnect();
      }
    }, []);

    // Send Ctrl+C
    const handleCtrlC = useCallback(() => {
      if (sessionRef.current) {
        sessionRef.current.sendSignal("SIGINT");
      }
    }, []);

    // Add session
    const addSession = useCallback(() => {
      const id = `session-${Date.now()}`;
      setSessions((prev) => [
        ...prev.map((s) => ({ ...s, active: false })),
        { id, label: id, active: true },
      ]);
      setActiveSession(id);
    }, []);

    // Remove session
    const removeSession = useCallback((id: string) => {
      if (id === "default") return;
      setSessions((prev) => {
        const filtered = prev.filter((s) => s.id !== id);
        // If the removed session was active, switch to first available
        const wasActive = prev.find((s) => s.id === id)?.active;
        if (wasActive && filtered.length > 0) {
          filtered[0].active = true;
          setActiveSession(filtered[0].id);
        }
        return filtered;
      });
    }, []);

    // Toolbar actions
    const toolbarStyle: React.CSSProperties = {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "4px 12px",
      background: "#1a1b26",
      borderBottom: "1px solid #2f3344",
      borderRadius: "8px 8px 0 0",
      flexWrap: "wrap" as const,
    };

    const containerStyle: React.CSSProperties = {
      display: "flex",
      flexDirection: "column",
      height: fullscreen ? "100vh" : "calc(100vh - 120px)",
      minHeight: 400,
      borderRadius: 8,
      overflow: "hidden",
      border: "1px solid #2f3344",
      background: "#1a1b26",
    };

    const terminalStyle: React.CSSProperties = {
      flex: 1,
      padding: 4,
      overflow: "hidden",
      position: "relative",
    };

    return (
      <div
        style={{
          padding: fullscreen ? 0 : "12px 12px 0",
          height: fullscreen ? "100vh" : "auto",
          background: "#0f1117",
        }}
      >
        {/* Header */}
        {!fullscreen && (
          <div style={{ marginBottom: 12 }}>
            <Title level={4} style={{ color: "#c0caf5", margin: 0 }}>
              <TerminalOutlined style={{ marginRight: 8 }} />
              Terminal
              <Text
                type="secondary"
                style={{
                  marginLeft: 12,
                  fontSize: 13,
                  color: "#565f89",
                }}
              >
                Shell interativo com acesso total ao sistema
              </Text>
            </Title>
          </div>
        )}

        {/* Terminal Container */}
        <div style={containerStyle}>
          {/* Toolbar */}
          <div style={toolbarStyle}>
            {/* Sessions tabs */}
            <div style={{ display: "flex", gap: 4, flex: 1, alignItems: "center" }}>
              {sessions.map((s) => (
                <div
                  key={s.id}
                  onClick={() => {
                    setSessions((prev) =>
                      prev.map((p) => ({ ...p, active: p.id === s.id }))
                    );
                    setActiveSession(s.id);
                  }}
                  style={{
                    padding: "3px 10px",
                    borderRadius: 4,
                    cursor: "pointer",
                    fontSize: 12,
                    background: s.active ? "#2f3344" : "transparent",
                    color: s.active ? "#c0caf5" : "#565f89",
                    border: "1px solid",
                    borderColor: s.active ? "#4a4f64" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    userSelect: "none",
                  }}
                >
                  <TerminalOutlined style={{ fontSize: 11 }} />
                  {s.label}
                  {s.id !== "default" && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSession(s.id);
                      }}
                      style={{
                        marginLeft: 4,
                        opacity: 0.6,
                        cursor: "pointer",
                        fontSize: 11,
                      }}
                    >
                      ×
                    </span>
                  )}
                </div>
              ))}
              <Tooltip title="Nova sessão">
                <Button
                  type="text"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={addSession}
                  style={{ color: "#565f89" }}
                />
              </Tooltip>
            </div>

            {/* Controls */}
            <Space size={4}>
              <Tag
                color={connected ? "green" : "red"}
                style={{
                  fontSize: 11,
                  marginRight: 4,
                  lineHeight: "18px",
                }}
              >
                {connected ? "● Conectado" : "○ Desconectado"}
              </Tag>

              <Tooltip title="Ctrl+C (interromper)">
                <Button
                  type="text"
                  size="small"
                  onClick={handleCtrlC}
                  icon={
                    <span style={{ fontSize: 12, fontWeight: "bold" }}>
                      ^C
                    </span>
                  }
                  style={{ color: "#f7768e" }}
                />
              </Tooltip>

              <Tooltip title="Reconectar">
                <Button
                  type="text"
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={handleReconnect}
                  style={{ color: "#565f89" }}
                />
              </Tooltip>

              <Tooltip title={fullscreen ? "Sair da tela cheia" : "Tela cheia"}>
                <Button
                  type="text"
                  size="small"
                  icon={
                    fullscreen ? (
                      <FullscreenExitOutlined />
                    ) : (
                      <FullscreenOutlined />
                    )
                  }
                  onClick={toggleFullscreen}
                  style={{ color: "#565f89" }}
                />
              </Tooltip>
            </Space>
          </div>

          {/* Terminal */}
          <div ref={containerRef} style={terminalStyle} />
        </div>

        {/* Footer info */}
        <div
          style={{
            padding: "8px 12px",
            fontSize: 12,
            color: "#565f89",
            textAlign: "center" as const,
          }}
        >
          <InfoCircleOutlined style={{ marginRight: 4 }} />
          Terminal com acesso total ao sistema • Use com responsabilidade
        </div>
      </div>
    );
  }

  // ── Register plugin route ────────────────────────────────────────────

  QwenPaw.registerRoutes("qwenpaw-terminal", [
    {
      path: "/plugin/terminal",
      component: TerminalPage,
      label: "Terminal",
      icon: "💻",
      priority: 100,
    },
  ]);

  console.log("[QwenPaw Terminal] Plugin registered at /plugin/terminal");
})();
