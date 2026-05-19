(function() {
  const p = window.QwenPaw;
  if (!p) {
    console.error("[QwenPaw Terminal] QwenPaw host API not found");
    return;
  }
  const { React: t, antd: k, antdIcons: v, getApiUrl: A, getApiToken: T } = p.host, {
    Card: V,
    Typography: R,
    Space: C,
    Button: h,
    Select: Y,
    Tag: _,
    Tooltip: f,
    message: W,
    Dropdown: Z,
    Input: ee,
    Modal: te,
    Spin: ne
  } = k, { Text: O, Title: z } = R, { useState: u, useEffect: b, useRef: B, useCallback: d } = t, {
    TerminalOutlined: S,
    ReloadOutlined: P,
    FullscreenOutlined: N,
    FullscreenExitOutlined: I,
    PlusOutlined: M,
    DeleteOutlined: ie,
    SettingOutlined: se,
    InfoCircleOutlined: D
  } = v || {};
  function F() {
    const c = "qwenpaw-terminal-xterm-css";
    if (document.getElementById(c)) return;
    const e = document.createElement("link");
    e.id = c, e.rel = "stylesheet", e.href = "https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css", document.head.appendChild(e);
  }
  class $ {
    constructor(e, a) {
      this.element = null, this.term = null, this.fitAddon = null, this.ws = null, this.onDisconnect = null, this.onReconnect = null, this._reconnectAttempts = 0, this._maxReconnectAttempts = 5, this._pendingOutput = [], this.sessionId = e, this.cwd = a;
      const r = A("/terminal/ws");
      this._wsUrl = r.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
    }
    async mount(e) {
      this.element = e;
      const a = await L();
      if (!a) {
        W.error("Falha ao carregar xterm.js");
        return;
      }
      const { Terminal: r } = a, { FitAddon: s } = await import("https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/+esm"), { WebLinksAddon: x } = await import("https://cdn.jsdelivr.net/npm/@xterm/addon-web-links@0.11.0/+esm");
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
      }), this.fitAddon = new s(), this.term.loadAddon(this.fitAddon), this.term.loadAddon(new x()), this.term.open(e), setTimeout(() => this.fitAddon.fit(), 50), this.connectWebSocket(), this.term.onData((i) => {
        this.ws && this.ws.readyState === WebSocket.OPEN && this.ws.send(
          JSON.stringify({ type: "input", data: i })
        );
      }), new ResizeObserver(() => {
        try {
          if (this.fitAddon.fit(), this.ws && this.ws.readyState === WebSocket.OPEN) {
            const i = this.fitAddon.proposeDimensions();
            i && this.ws.send(
              JSON.stringify({
                type: "resize",
                cols: i.cols,
                rows: i.rows
              })
            );
          }
        } catch {
        }
      }).observe(e), this.term.attachCustomKeyEventHandler((i) => {
        if (i.ctrlKey && i.shiftKey && i.key === "C") {
          const m = this.term.getSelection();
          if (m)
            return navigator.clipboard.writeText(m), !1;
        }
        return i.ctrlKey && i.shiftKey && i.key === "V" ? (navigator.clipboard.readText().then((m) => {
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
        const e = T(), a = e ? `${this._wsUrl}?token=${encodeURIComponent(e)}` : this._wsUrl;
        this.ws = new WebSocket(a), this.ws.onopen = () => {
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
  let w = null;
  async function L() {
    return window.__QWENPAW_TERMINAL_XTERM ? window.__QWENPAW_TERMINAL_XTERM : (w || (w = (async () => {
      const c = await import("https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/+esm");
      return window.__QWENPAW_TERMINAL_XTERM = c, c;
    })()), w);
  }
  function Q() {
    const c = B(null), e = B(null), [a, r] = u(!1), [s, x] = u(!1), [E, i] = u([
      { id: "default", label: "default", active: !0 }
    ]), [m, g] = u("default");
    b(() => (F(), () => {
      e.current && (e.current.destroy(), e.current = null);
    }), []), b(() => {
      if (!c.current) return;
      e.current && (e.current.destroy(), e.current = null);
      const n = new $(m, "~");
      n.onDisconnect = () => r(!1), n.onReconnect = () => r(!0), n.mount(c.current).then(() => {
        r(!0), setTimeout(() => n.fit(), 100);
      }), e.current = n;
      const o = () => n.fit();
      return window.addEventListener("resize", o), () => {
        window.removeEventListener("resize", o);
      };
    }, [m]);
    const J = d(() => {
      x((n) => !n), setTimeout(() => {
        e.current && e.current.fit();
      }, 200);
    }, []), U = d(() => {
      e.current && e.current.reconnect();
    }, []), H = d(() => {
      e.current && e.current.sendSignal("SIGINT");
    }, []), K = d(() => {
      const n = `session-${Date.now()}`;
      i((o) => [
        ...o.map((l) => ({ ...l, active: !1 })),
        { id: n, label: n, active: !0 }
      ]), g(n);
    }, []), X = d((n) => {
      n !== "default" && i((o) => {
        const l = o.filter((y) => y.id !== n);
        return o.find((y) => y.id === n)?.active && l.length > 0 && (l[0].active = !0, g(l[0].id)), l;
      });
    }, []), j = {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "4px 12px",
      background: "#1a1b26",
      borderBottom: "1px solid #2f3344",
      borderRadius: "8px 8px 0 0",
      flexWrap: "wrap"
    }, q = {
      display: "flex",
      flexDirection: "column",
      height: s ? "100vh" : "calc(100vh - 120px)",
      minHeight: 400,
      borderRadius: 8,
      overflow: "hidden",
      border: "1px solid #2f3344",
      background: "#1a1b26"
    }, G = {
      flex: 1,
      padding: 4,
      overflow: "hidden",
      position: "relative"
    };
    return /* @__PURE__ */ t.createElement(
      "div",
      {
        style: {
          padding: s ? 0 : "12px 12px 0",
          height: s ? "100vh" : "auto",
          background: "#0f1117"
        }
      },
      !s && /* @__PURE__ */ t.createElement("div", { style: { marginBottom: 12 } }, /* @__PURE__ */ t.createElement(z, { level: 4, style: { color: "#c0caf5", margin: 0 } }, /* @__PURE__ */ t.createElement(S, { style: { marginRight: 8 } }), "Terminal", /* @__PURE__ */ t.createElement(
        O,
        {
          type: "secondary",
          style: {
            marginLeft: 12,
            fontSize: 13,
            color: "#565f89"
          }
        },
        "Shell interativo com acesso total ao sistema"
      ))),
      /* @__PURE__ */ t.createElement("div", { style: q }, /* @__PURE__ */ t.createElement("div", { style: j }, /* @__PURE__ */ t.createElement("div", { style: { display: "flex", gap: 4, flex: 1, alignItems: "center" } }, E.map((n) => /* @__PURE__ */ t.createElement(
        "div",
        {
          key: n.id,
          onClick: () => {
            i(
              (o) => o.map((l) => ({ ...l, active: l.id === n.id }))
            ), g(n.id);
          },
          style: {
            padding: "3px 10px",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 12,
            background: n.active ? "#2f3344" : "transparent",
            color: n.active ? "#c0caf5" : "#565f89",
            border: "1px solid",
            borderColor: n.active ? "#4a4f64" : "transparent",
            display: "flex",
            alignItems: "center",
            gap: 6,
            userSelect: "none"
          }
        },
        /* @__PURE__ */ t.createElement(S, { style: { fontSize: 11 } }),
        n.label,
        n.id !== "default" && /* @__PURE__ */ t.createElement(
          "span",
          {
            onClick: (o) => {
              o.stopPropagation(), X(n.id);
            },
            style: {
              marginLeft: 4,
              opacity: 0.6,
              cursor: "pointer",
              fontSize: 11
            }
          },
          "×"
        )
      )), /* @__PURE__ */ t.createElement(f, { title: "Nova sessão" }, /* @__PURE__ */ t.createElement(
        h,
        {
          type: "text",
          size: "small",
          icon: /* @__PURE__ */ t.createElement(M, null),
          onClick: K,
          style: { color: "#565f89" }
        }
      ))), /* @__PURE__ */ t.createElement(C, { size: 4 }, /* @__PURE__ */ t.createElement(
        _,
        {
          color: a ? "green" : "red",
          style: {
            fontSize: 11,
            marginRight: 4,
            lineHeight: "18px"
          }
        },
        a ? "● Conectado" : "○ Desconectado"
      ), /* @__PURE__ */ t.createElement(f, { title: "Ctrl+C (interromper)" }, /* @__PURE__ */ t.createElement(
        h,
        {
          type: "text",
          size: "small",
          onClick: H,
          icon: /* @__PURE__ */ t.createElement("span", { style: { fontSize: 12, fontWeight: "bold" } }, "^C"),
          style: { color: "#f7768e" }
        }
      )), /* @__PURE__ */ t.createElement(f, { title: "Reconectar" }, /* @__PURE__ */ t.createElement(
        h,
        {
          type: "text",
          size: "small",
          icon: /* @__PURE__ */ t.createElement(P, null),
          onClick: U,
          style: { color: "#565f89" }
        }
      )), /* @__PURE__ */ t.createElement(f, { title: s ? "Sair da tela cheia" : "Tela cheia" }, /* @__PURE__ */ t.createElement(
        h,
        {
          type: "text",
          size: "small",
          icon: s ? /* @__PURE__ */ t.createElement(I, null) : /* @__PURE__ */ t.createElement(N, null),
          onClick: J,
          style: { color: "#565f89" }
        }
      )))), /* @__PURE__ */ t.createElement("div", { ref: c, style: G })),
      /* @__PURE__ */ t.createElement(
        "div",
        {
          style: {
            padding: "8px 12px",
            fontSize: 12,
            color: "#565f89",
            textAlign: "center"
          }
        },
        /* @__PURE__ */ t.createElement(D, { style: { marginRight: 4 } }),
        "Terminal com acesso total ao sistema • Use com responsabilidade"
      )
    );
  }
  p.registerRoutes("qwenpaw-terminal", [
    {
      path: "/plugin/terminal",
      component: Q,
      label: "Terminal",
      icon: "💻",
      priority: 100
    }
  ]), console.log("[QwenPaw Terminal] Plugin registered at /plugin/terminal");
})();
