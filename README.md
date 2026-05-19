# 💻 QwenPaw Terminal

> **Terminal de comando integrado ao QwenPaw com acesso total ao sistema.**

Execute comandos shell, scripts, gerencie processos e navegue pelo filesystem diretamente pelo menu do QwenPaw — sem sair do console.

![License](https://img.shields.io/badge/license-MIT-blue)
![QwenPaw](https://img.shields.io/badge/QwenPaw-v1.1.7%2B-brightgreen)
![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS-lightgrey)

---

## 🚀 Features

| Feature | Descrição |
|---------|-----------|
| 🖥️ **Terminal Interativo** | Shell completo com emulação xterm.js no console do QwenPaw |
| ⚡ **Tempo Real** | Comunicação bidirecional via WebSocket — resposta instantânea |
| 🎨 **Tema Tokyo Night** | Terminal bonito com syntax highlighting e 256 cores |
| 📁 **Navegação por CWD** | Mantém diretório de trabalho por sessão |
| 🔄 **Múltiplas Sessões** | Abra quantos terminais quiser, cada um com seu estado |
| 🛑 **Gerenciamento de Processos** | Ctrl+C, SIGTERM, SIGKILL — controle total |
| 📋 **Copy/Paste** | Ctrl+Shift+C copiar, Ctrl+Shift+V colar |
| 🔌 **Reconexão Automática** | Reconecta automaticamente em caso de queda |
| 🧰 **Tools para Agentes** | Use `terminal_exec`, `terminal_cwd`, `terminal_which` nos seus agentes |
| 🔐 **Segurança** | Acesso total ao sistema — use com responsabilidade |

---

## 📦 Instalação

### Pré-requisitos

- **QwenPaw v1.1.7+** com sistema de plugins ativo
- **Python 3.10+**
- **Node.js 18+** (apenas para build do frontend)

### 📥 Instalar pelo Console (ZIP URL)

> ⚠️ O QwenPaw precisa de uma URL direta de ZIP, não da página do repositório.

1. Vá em **Settings → Plugins**
2. Clique em **Install**
3. Informe a URL direta do ZIP:
   ```
   https://github.com/Jailtonfonseca/qwenpaw-terminal-plugin/archive/refs/heads/main.zip
   ```
4. Clique em **Install** e aguarde

### 📦 Instalar via Release (recomendado)

Baixe o ZIP da **[última release](https://github.com/Jailtonfonseca/qwenpaw-terminal-plugin/releases)** e faça upload pelo Console.

### 📁 Instalar via path local

```bash
git clone https://github.com/Jailtonfonseca/qwenpaw-terminal-plugin.git /caminho/local/terminal

cd /caminho/local/terminal/ui
npm install
npm run build
cd ..

# No Console, informe o path: /caminho/local/terminal
```

---

## 🛠️ Como Usar

### Pelo Menu do QwenPaw

1. Após instalar, vá para o menu lateral
2. Clique em **💻 Terminal**
3. Pronto! Um shell completo esperando seus comandos

### Por Agentes

O plugin expõe 3 tools que os agentes do QwenPaw podem usar:

| Tool | Descrição | Exemplo |
|------|-----------|---------|
| `terminal_exec` | Executa qualquer comando shell | `terminal_exec(command="ls -la", cwd="/home")` |
| `terminal_cwd` | Obtém ou muda o diretório | `terminal_cwd()` ou `terminal_cwd(path="/etc")` |
| `terminal_which` | Verifica se comando existe | `terminal_which(command="git")` |

**Exemplo com agentes:**

```
User: "Quero ver os arquivos do projeto que está rodando na porta 3000"
Agent: *usa terminal_which + terminal_exec para descobrir e listar*
```

---

## 🏗️ Estrutura do Projeto

```
qwenpaw-terminal-plugin/
├── plugin.json                 # Manifesto do plugin
├── plugin.py                   # Entry point (registra tools + router)
├── backend/
│   ├── __init__.py
│   ├── shell_manager.py        # Gerenciamento de processos/PTY
│   └── terminal_api.py         # API REST + WebSocket
├── ui/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── src/
│       └── index.ts            # Frontend (xterm.js + React)
├── README.md
├── LICENSE
└── .gitignore
```

---

## 🔌 API Reference

### WebSocket — `/api/terminal/ws`

Conexão bidirecional para terminal interativo.

**Handshake (cliente → servidor):**
```json
{"type": "init", "session_id": "default", "cwd": "/home/user"}
```

**Mensagens cliente → servidor:**
| type | Payload | Descrição |
|------|---------|-----------|
| `input` | `{"data": "ls -la"}` | Dados digitados no terminal |
| `resize` | `{"cols": 80, "rows": 24}` | Redimensionar PTY |
| `signal` | `{"signal": "SIGINT"}` | Enviar sinal ao processo |
| `cwd` | `{"path": "/home"}` | Mudar diretório |
| `exec` | `{"command": "...", "timeout": 30}` | Executar comando e aguardar |
| `ping` | `{}` | Keepalive |

**Mensagens servidor → cliente:**
| type | Payload | Descrição |
|------|---------|-----------|
| `init_ack` | `{"session_id": "...", "cwd": "...", ...}` | Confirmação de conexão |
| `output` | `{"data": "..."}` | Saída do terminal (raw) |
| `exec_result` | `{"output": "...", "exit_code": 0}` | Resultado de comando |
| `error` | `{"message": "..."}` | Erro |
| `pong` | `{}` | Resposta a ping |

### REST

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/api/terminal/exec` | Executar comando (non-interactive) |
| `GET` | `/api/terminal/cwd?session_id=default` | Obter CWD |
| `POST` | `/api/terminal/cwd` | Definir CWD |
| `GET` | `/api/terminal/which/{command}` | Verificar comando |
| `POST` | `/api/terminal/kill` | Encerrar processo |
| `POST` | `/api/terminal/resize` | Redimensionar PTY |

---

## ⚙️ Configuração

O terminal funciona **sem configuração** — zero setup.

Variáveis de ambiente (opcionais):

| Variável | Default | Descrição |
|----------|---------|-----------|
| `SHELL` | `/bin/sh` | Shell a ser usado (bash, zsh, fish...) |
| `TERM` | `xterm-256color` | Tipo de terminal |

---

## 🧪 Desenvolvimento

```bash
# Clone
git clone <repo>
cd qwenpaw-terminal-plugin

# Backend (Python)
pip install -r requirements.txt  # se houver

# Frontend
cd ui
npm install
npm run build  # → ui/dist/index.js
```

### Hot Reload do Frontend

```bash
cd ui
npm run dev  # watch mode — rebuild automático
```

---

## 🔒 Segurança

> ⚠️ **Este plugin dá acesso total ao sistema operacional via shell.**

- O terminal executa comandos com as mesmas permissões do processo QwenPaw
- Use com responsabilidade — é como abrir um terminal real
- Ideal para desenvolvimento e administração do sistema
- Não compartilhe acesso ao QwenPaw com pessoas não autorizadas

---

## 📄 Licença

MIT © 2026 dev-agent

---

## 🤝 Contribuindo

1. Fork o projeto
2. Crie sua branch: `git checkout -b feature/nova-feature`
3. Commit: `git commit -m "feat: adiciona nova feature X"`
4. Push: `git push origin feature/nova-feature`
5. Abra um Pull Request
