# 📖 Guia de Desenvolvimento de Plugins QwenPaw

Baseado na engenharia reversa do código fonte do QwenPaw v1.1.7+.

---

## 🧱 Estrutura de um Plugin

### Mínimo necessário

```
meu-plugin/
├── plugin.json          # Manifesto (obrigatório)
├── plugin.py            # Entry point backend (obrigatório se tiver backend)
└── ui/dist/index.js     # Frontend bundle (opcional)
```

### plugin.json — Manifesto

```json
{
  "id": "meu-plugin",
  "name": "Meu Plugin",
  "version": "1.0.0",
  "type": "tool",
  "description": "Descrição do plugin",
  "author": "Seu Nome",
  "entry": {
    "backend": "plugin.py",
    "frontend": "ui/dist/index.js"
  },
  "dependencies": [],
  "min_version": "1.1.7",
  "meta": {}
}
```

**Campos importantes:**
- `id`: identificador único (lowercase + hífens)
- `type`: `"tool"` | `"provider"` | `"hook"` | `"command"` | `"frontend"` | `"general"`
- `entry.backend`: caminho relativo ao diretório do plugin
- `entry.frontend`: caminho relativo ao bundle JS

---

## 🐍 Backend (Python)

### ⚠️ REGRA DE OURO: Use imports relativos!

O loader carrega pluguins via `importlib` com `submodule_search_locations`.  
**NÃO adiciona o diretório ao `sys.path`.**

```python
# ✅ CERTO — imports relativos
from .backend.terminal_api import router
from .backend.shell_manager import shell_manager

# ❌ ERRADO — "No module named 'backend'"
from backend.terminal_api import router
```

### Estrutura do entry point (plugin.py)

```python
from qwenpaw.plugins.api import PluginApi
import logging

logger = logging.getLogger(__name__)


class MeuPlugin:
    def register(self, api: PluginApi):
        """Registra capacidades do plugin."""
        logger.info("Registrando...")

        # ─ Tools ─────────────────────────────
        async def minha_tool(param: str):
            return {"resultado": f"Olá {param}"}

        api.register_tool(
            tool_name="minha_tool",
            tool_func=minha_tool,
            description="Descrição da tool",
            icon="🔧",
        )

        # ─ HTTP Router ───────────────────────
        from fastapi import APIRouter
        router = APIRouter()

        @router.get("/exemplo")
        async def exemplo():
            return {"mensagem": "olá"}

        api.register_http_router(router, prefix="/exemplo", tags=["exemplo"])

        # ─ Startup Hook ──────────────────────
        async def on_startup():
            logger.info("Plugin iniciou!")

        api.register_startup_hook("meu_startup", on_startup, priority=50)

        # ─ Shutdown Hook ─────────────────────
        async def on_shutdown():
            logger.info("Plugin finalizou!")

        api.register_shutdown_hook("meu_shutdown", on_shutdown, priority=50)


# 🔴 OBRIGATÓRIO: exportar instância como 'plugin'
plugin = MeuPlugin()
```

### 🚨 O loader faz `module.plugin` — se não existir, dá erro:

```
AttributeError: Plugin module must export 'plugin' object
```

Sempre inclua `plugin = SuaClasse()` no final do `plugin.py`.

### PluginApi — Métodos Disponíveis

| Método | Descrição |
|--------|-----------|
| `register_tool(name, func, desc, icon)` | Registra tool para agentes |
| `register_provider(id, class, label, base_url, ...)` | Registra provedor LLM |
| `register_http_router(router, prefix, tags)` | Expõe endpoints REST/WS |
| `register_startup_hook(name, callback, priority)` | Hook de inicialização |
| `register_shutdown_hook(name, callback, priority)` | Hook de finalização |
| `register_control_command(handler, priority)` | Comando customizado |
| `get_tool_config(tool_name, agent_id)` | Lê config da tool |
| `set_tool_config(tool_name, agent_id, config)` | Salva config da tool |

---

## 🖥️ Frontend (TypeScript/React)

### Bundle com Vite

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react({ jsxRuntime: "classic" })],  // ← classic!
  build: {
    lib: {
      entry: "src/index.tsx",
      formats: ["es"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      external: ["react", "react-dom", "antd", "@ant-design/icons"],
    },
  },
});
```

**Pontos críticos:**
- `jsxRuntime: "classic"` → compila JSX para `React.createElement`
- `external: ["react", "react-dom", "antd"]` → não bundlear o que já existe no host

### API disponível via `window.QwenPaw.host`

```tsx
const { React, antd, antdIcons, getApiUrl, getApiToken } =
  (window as any).QwenPaw.host;
```

| Export | Tipo | Descrição |
|--------|------|-----------|
| `React` | `typeof React` | React runtime |
| `ReactDOM` | `typeof ReactDOM` | ReactDOM |
| `antd` | `typeof antd` | Ant Design |
| `antdIcons` | `typeof @ant-design/icons` | Icones |
| `getApiUrl(path)` | `(path) => string` | Monta URL completa da API |
| `getApiToken()` | `() => string` | Token de autenticação |

### Registrar página no menu lateral

```tsx
function MinhaPagina() {
  const { Typography } = antd;
  const { Title } = Typography;
  return <Title level={2}>Minha Página</Title>;
}

(window as any).QwenPaw.registerRoutes?.("meu-plugin", [
  {
    path: "/plugin/meu-plugin/home",
    component: MinhaPagina,
    label: "Minha Página",
    icon: "🚀",
    priority: 100,  // menor = mais no topo
  },
]);
```

### Registrar renderizador customizado de tools

```tsx
(window as any).QwenPaw.registerToolRender?.("meu-plugin", {
  minha_tool: MeuComponenteCustomizado,
});
```

---

## 🚨 Erros Comuns e Soluções

| Erro | Causa | Solução |
|------|-------|---------|
| `No module named 'backend'` | Import absoluto | Use `from .backend.xxx` |
| `Plugin module must export 'plugin' object` | Falta instância | Adicione `plugin = SuaClasse()` |
| `File is not a zip file` | URL do repositório (página) | Use URL do ZIP direto: `.../archive/refs/heads/main.zip` |
| `Failed to load module spec` | `plugin.py` não encontrado | Verifique `entry.backend` no `plugin.json` |
| Frontend não aparece | Bundle não encontrado | Verifique `entry.frontend` e se `dist/index.js` existe |
| `react/jsx-runtime` not found | `jsxRuntime` errado | Use `jsxRuntime: "classic"` no Vite |
| Tool não aparece nos agentes | Tool desabilitada por padrão | Adicione `enabled: true` no `register_tool()` ou ative manualmente |

---

## 📦 Instalação do Plugin

### Via URL do ZIP (console)

```
https://github.com/usuario/repo/archive/refs/heads/main.zip
```

### Via path local

```bash
qwenpaw plugin install /caminho/para/meu-plugin
```

### Via ZIP upload

```bash
cd meu-plugin && zip -r ../meu-plugin.zip .
# Upload pelo Console: Settings → Plugins → Upload
```

---

## 🔍 Como descobri isso

Este guia foi criado analisando:

1. `src/qwenpaw/plugins/loader.py` — como o loader importa módulos
2. `src/qwenpaw/plugins/api.py` — API disponível para plugins
3. `src/qwenpaw/plugins/architecture.py` — modelos de dados
4. `console/src/plugins/hostExternals.ts` — API do frontend
5. `console/src/plugins/moduleRegistry.ts` — registro de módulos
6. `plugins/bundle/cloudpaw/` — plugin de exemplo real (CloudPaw)
7. `plugins/video-editor-tool/` — plugin de exemplo real (Video Editor)
8. `website/public/docs/plugins.en.md` — documentação oficial
