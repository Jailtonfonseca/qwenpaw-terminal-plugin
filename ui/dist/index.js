import { jsxs as d, jsx as i } from "react/jsx-runtime";
(function() {
  const w = window.QwenPaw;
  if (!w) {
    console.error("[QwenPaw Terminal] QwenPaw host API not found");
    return;
  }
  const { React: A, antd: T, antdIcons: R, getApiUrl: C, getApiToken: _ } = w.host, {
    Card: Z,
    Typography: W,
    Space: O,
    Button: f,
    Select: ee,
    Tag: E,
    Tooltip: u,
    message: z,
    Dropdown: te,
    Input: ie,
    Modal: ne,
    Spin: se
  } = T, { Text: P, Title: N } = W, { useState: p, useEffect: B, useRef: S, useCallback: h } = A, {
    TerminalOutlined: k,
    ReloadOutlined: I,
    FullscreenOutlined: M,
    FullscreenExitOutlined: D,
    PlusOutlined: F,
    DeleteOutlined: re,
    SettingOutlined: oe,
    InfoCircleOutlined: $
  } = R || {};
  function L() {
    const c = "qwenpaw-terminal-xterm-css";
    if (document.getElementById(c)) return;
    const e = document.createElement("link");
    e.id = c, e.rel = "stylesheet", e.href = "https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css", document.head.appendChild(e);
  }
  class Q {
    constructor(e, l) {
      this.element = null, this.term = null, this.fitAddon = null, this.ws = null, this.onDisconnect = null, this.onReconnect = null, this._reconnectAttempts = 0, this._maxReconnectAttempts = 5, this._pendingOutput = [], this.sessionId = e, this.cwd = l;
      const r = C("/terminal/ws");
      this._wsUrl = r.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
    }
    async mount(e) {
      this.element = e;
      const l = await J();
      if (!l) {
        z.error("Falha ao carregar xterm.js");
        return;
      }
      const { Terminal: r } = l, { FitAddon: s } = await import("https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/+esm"), { WebLinksAddon: g } = await import("https://cdn.jsdelivr.net/npm/@xterm/addon-web-links@0.11.0/+esm");
      this.term = new r({
        cursorBlink: !0,
        cursorStyle: "block",
        fontSize: 14,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Menlo', 'Monaco', monospace",
        lineHeight: 1.3,
        allowTransparency: !0,
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
          brightWhite: "#c0caf5"
        },
        allowProposedApi: !0,
        convertEol: !0,
        scrollback: 5e3
      }), this.fitAddon = new s(), this.term.loadAddon(this.fitAddon), this.term.loadAddon(new g()), this.term.open(e), setTimeout(() => this.fitAddon.fit(), 50), this.connectWebSocket(), this.term.onData((n) => {
        this.ws && this.ws.readyState === WebSocket.OPEN && this.ws.send(
          JSON.stringify({ type: "input", data: n })
        );
      }), new ResizeObserver(() => {
        try {
          if (this.fitAddon.fit(), this.ws && this.ws.readyState === WebSocket.OPEN) {
            const n = this.fitAddon.proposeDimensions();
            n && this.ws.send(
              JSON.stringify({
                type: "resize",
                cols: n.cols,
                rows: n.rows
              })
            );
          }
        } catch {
        }
      }).observe(e), this.term.attachCustomKeyEventHandler((n) => {
        if (n.ctrlKey && n.shiftKey && n.key === "C") {
          const m = this.term.getSelection();
          if (m)
            return navigator.clipboard.writeText(m), !1;
        }
        return n.ctrlKey && n.shiftKey && n.key === "V" ? (navigator.clipboard.readText().then((m) => {
          this.ws && this.ws.readyState === WebSocket.OPEN && this.ws.send(
            JSON.stringify({ type: "input", data: m })
          );
        }), !1) : !0;
      }), this.writeWelcome();
    }
    writeWelcome() {
      const e = [
        "\x1B[36m╔════════════════════════════════════════════════════╗\x1B[0m",
        "\x1B[36m║\x1B[0m  \x1B[1;33mQwenPaw Terminal v1.0.0\x1B[0m                        \x1B[36m║\x1B[0m",
        "\x1B[36m║\x1B[0m  \x1B[90mTerminal interativo com acesso total ao sistema\x1B[0m   \x1B[36m║\x1B[0m",
        "\x1B[36m║\x1B[0m                                                     \x1B[36m║\x1B[0m",
        `\x1B[36m║\x1B[0m  \x1B[32m📁\x1B[0m \x1B[37mCWD:\x1B[0m \x1B[35m${this.cwd}\x1B[0m                    \x1B[36m║\x1B[0m`,
        "\x1B[36m║\x1B[0m  \x1B[32m🔌\x1B[0m \x1B[37mSocket:\x1B[0m \x1B[35mconectando...\x1B[0m               \x1B[36m║\x1B[0m",
        "\x1B[36m╚════════════════════════════════════════════════════╝\x1B[0m",
        "",
        "\x1B[90mDicas: Ctrl+Shift+C copiar | Ctrl+Shift+V colar | Ctrl+C interrompe\x1B[0m",
        ""
      ];
      this.term.writeln(e.join(`\r
`));
    }
    connectWebSocket() {
      try {
        const e = _(), l = e ? `${this._wsUrl}?token=${encodeURIComponent(e)}` : this._wsUrl;
        this.ws = new WebSocket(l), this.ws.onopen = () => {
          this._reconnectAttempts = 0, this.ws.send(
            JSON.stringify({
              type: "init",
              session_id: this.sessionId,
              cwd: this.cwd
            })
          ), this.onReconnect && this.onReconnect();
        }, this.ws.onmessage = (r) => {
          try {
            const s = JSON.parse(r.data);
            switch (s.type) {
              case "init_ack":
                this.cwd = s.cwd;
                break;
              case "output":
                this.term && this.term.write(s.data);
                break;
              case "exec_result":
                this.term && this.term.write(
                  `\r
\x1B[90m[exit: ${s.exit_code}]\x1B[0m\r
`
                );
                break;
              case "error":
                this.term && this.term.writeln(
                  `\r
\x1B[31mError: ${s.message}\x1B[0m`
                );
                break;
              case "pong":
                break;
              default:
                break;
            }
          } catch {
          }
        }, this.ws.onclose = () => {
          this.term && this.term.writeln(
            `\r
\x1B[33m⚠️  Conexão perdida. Tentando reconectar...\x1B[0m`
          ), this.onDisconnect && this.onDisconnect(), this.attemptReconnect();
        }, this.ws.onerror = (r) => {
          console.error("[Terminal] WebSocket error:", r);
        };
      } catch (e) {
        console.error("[Terminal] Failed to create WebSocket:", e);
      }
    }
    attemptReconnect() {
      if (this._reconnectAttempts >= this._maxReconnectAttempts) {
        this.term && (this.term.writeln(
          `\r
\x1B[31m✕ Falha na reconexão após ${this._maxReconnectAttempts} tentativas.\x1B[0m`
        ), this.term.writeln(
          '\x1B[33mRecarregue a página ou clique em "Reconectar".\x1B[0m'
        ));
        return;
      }
      this._reconnectAttempts++;
      const e = Math.min(1e3 * Math.pow(2, this._reconnectAttempts), 1e4);
      this.term && this.term.writeln(
        `\r
\x1B[90mTentativa ${this._reconnectAttempts}/${this._maxReconnectAttempts} em ${e / 1e3}s...\x1B[0m`
      ), setTimeout(() => {
        this.ws && (this.ws.close(), this.ws = null), this.connectWebSocket();
      }, e);
    }
    reconnect() {
      this._reconnectAttempts = 0, this.ws && (this.ws.close(), this.ws = null), this.connectWebSocket();
    }
    sendSignal(e) {
      this.ws && this.ws.readyState === WebSocket.OPEN && this.ws.send(JSON.stringify({ type: "signal", signal: e }));
    }
    fit() {
      try {
        if (this.fitAddon && (this.fitAddon.fit(), this.ws && this.ws.readyState === WebSocket.OPEN)) {
          const e = this.fitAddon.proposeDimensions();
          e && this.ws.send(
            JSON.stringify({ type: "resize", cols: e.cols, rows: e.rows })
          );
        }
      } catch {
      }
    }
    destroy() {
      this.ws && (this.ws.close(), this.ws = null), this.term && (this.term.dispose(), this.term = null), this.fitAddon = null, this.element && (this.element.innerHTML = "", this.element = null);
    }
  }
  let x = null;
  async function J() {
    return window.__QWENPAW_TERMINAL_XTERM ? window.__QWENPAW_TERMINAL_XTERM : (x || (x = (async () => {
      const c = await import("https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/+esm");
      return window.__QWENPAW_TERMINAL_XTERM = c, c;
    })()), x);
  }
  function U() {
    const c = S(null), e = S(null), [l, r] = p(!1), [s, g] = p(!1), [v, n] = p([
      { id: "default", label: "default", active: !0 }
    ]), [m, y] = p("default");
    B(() => (L(), () => {
      e.current && (e.current.destroy(), e.current = null);
    }), []), B(() => {
      if (!c.current) return;
      e.current && (e.current.destroy(), e.current = null);
      const t = new Q(m, "~");
      t.onDisconnect = () => r(!1), t.onReconnect = () => r(!0), t.mount(c.current).then(() => {
        r(!0), setTimeout(() => t.fit(), 100);
      }), e.current = t;
      const o = () => t.fit();
      return window.addEventListener("resize", o), () => {
        window.removeEventListener("resize", o);
      };
    }, [m]);
    const j = h(() => {
      g((t) => !t), setTimeout(() => {
        e.current && e.current.fit();
      }, 200);
    }, []), H = h(() => {
      e.current && e.current.reconnect();
    }, []), K = h(() => {
      e.current && e.current.sendSignal("SIGINT");
    }, []), X = h(() => {
      const t = `session-${Date.now()}`;
      n((o) => [
        ...o.map((a) => ({ ...a, active: !1 })),
        { id: t, label: t, active: !0 }
      ]), y(t);
    }, []), q = h((t) => {
      t !== "default" && n((o) => {
        const a = o.filter((b) => b.id !== t);
        return o.find((b) => b.id === t)?.active && a.length > 0 && (a[0].active = !0, y(a[0].id)), a;
      });
    }, []), G = {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "4px 12px",
      background: "#1a1b26",
      borderBottom: "1px solid #2f3344",
      borderRadius: "8px 8px 0 0",
      flexWrap: "wrap"
    }, V = {
      display: "flex",
      flexDirection: "column",
      height: s ? "100vh" : "calc(100vh - 120px)",
      minHeight: 400,
      borderRadius: 8,
      overflow: "hidden",
      border: "1px solid #2f3344",
      background: "#1a1b26"
    }, Y = {
      flex: 1,
      padding: 4,
      overflow: "hidden",
      position: "relative"
    };
    return /* @__PURE__ */ d(
      "div",
      {
        style: {
          padding: s ? 0 : "12px 12px 0",
          height: s ? "100vh" : "auto",
          background: "#0f1117"
        },
        children: [
          !s && /* @__PURE__ */ i("div", { style: { marginBottom: 12 }, children: /* @__PURE__ */ d(N, { level: 4, style: { color: "#c0caf5", margin: 0 }, children: [
            /* @__PURE__ */ i(k, { style: { marginRight: 8 } }),
            "Terminal",
            /* @__PURE__ */ i(
              P,
              {
                type: "secondary",
                style: {
                  marginLeft: 12,
                  fontSize: 13,
                  color: "#565f89"
                },
                children: "Shell interativo com acesso total ao sistema"
              }
            )
          ] }) }),
          /* @__PURE__ */ d("div", { style: V, children: [
            /* @__PURE__ */ d("div", { style: G, children: [
              /* @__PURE__ */ d("div", { style: { display: "flex", gap: 4, flex: 1, alignItems: "center" }, children: [
                v.map((t) => /* @__PURE__ */ d(
                  "div",
                  {
                    onClick: () => {
                      n(
                        (o) => o.map((a) => ({ ...a, active: a.id === t.id }))
                      ), y(t.id);
                    },
                    style: {
                      padding: "3px 10px",
                      borderRadius: 4,
                      cursor: "pointer",
                      fontSize: 12,
                      background: t.active ? "#2f3344" : "transparent",
                      color: t.active ? "#c0caf5" : "#565f89",
                      border: "1px solid",
                      borderColor: t.active ? "#4a4f64" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      userSelect: "none"
                    },
                    children: [
                      /* @__PURE__ */ i(k, { style: { fontSize: 11 } }),
                      t.label,
                      t.id !== "default" && /* @__PURE__ */ i(
                        "span",
                        {
                          onClick: (o) => {
                            o.stopPropagation(), q(t.id);
                          },
                          style: {
                            marginLeft: 4,
                            opacity: 0.6,
                            cursor: "pointer",
                            fontSize: 11
                          },
                          children: "×"
                        }
                      )
                    ]
                  },
                  t.id
                )),
                /* @__PURE__ */ i(u, { title: "Nova sessão", children: /* @__PURE__ */ i(
                  f,
                  {
                    type: "text",
                    size: "small",
                    icon: /* @__PURE__ */ i(F, {}),
                    onClick: X,
                    style: { color: "#565f89" }
                  }
                ) })
              ] }),
              /* @__PURE__ */ d(O, { size: 4, children: [
                /* @__PURE__ */ i(
                  E,
                  {
                    color: l ? "green" : "red",
                    style: {
                      fontSize: 11,
                      marginRight: 4,
                      lineHeight: "18px"
                    },
                    children: l ? "● Conectado" : "○ Desconectado"
                  }
                ),
                /* @__PURE__ */ i(u, { title: "Ctrl+C (interromper)", children: /* @__PURE__ */ i(
                  f,
                  {
                    type: "text",
                    size: "small",
                    onClick: K,
                    icon: /* @__PURE__ */ i("span", { style: { fontSize: 12, fontWeight: "bold" }, children: "^C" }),
                    style: { color: "#f7768e" }
                  }
                ) }),
                /* @__PURE__ */ i(u, { title: "Reconectar", children: /* @__PURE__ */ i(
                  f,
                  {
                    type: "text",
                    size: "small",
                    icon: /* @__PURE__ */ i(I, {}),
                    onClick: H,
                    style: { color: "#565f89" }
                  }
                ) }),
                /* @__PURE__ */ i(u, { title: s ? "Sair da tela cheia" : "Tela cheia", children: /* @__PURE__ */ i(
                  f,
                  {
                    type: "text",
                    size: "small",
                    icon: s ? /* @__PURE__ */ i(D, {}) : /* @__PURE__ */ i(M, {}),
                    onClick: j,
                    style: { color: "#565f89" }
                  }
                ) })
              ] })
            ] }),
            /* @__PURE__ */ i("div", { ref: c, style: Y })
          ] }),
          /* @__PURE__ */ d(
            "div",
            {
              style: {
                padding: "8px 12px",
                fontSize: 12,
                color: "#565f89",
                textAlign: "center"
              },
              children: [
                /* @__PURE__ */ i($, { style: { marginRight: 4 } }),
                "Terminal com acesso total ao sistema • Use com responsabilidade"
              ]
            }
          )
        ]
      }
    );
  }
  w.registerRoutes("qwenpaw-terminal", [
    {
      path: "/plugin/terminal",
      component: U,
      label: "Terminal",
      icon: "💻",
      priority: 100
    }
  ]), console.log("[QwenPaw Terminal] Plugin registered at /plugin/terminal");
})();
