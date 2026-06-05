# Chai — Build Roadmap

**Goal:** replicate Claude Desktop functionality in a custom app (Chai), with a simple, efficient,
and flexible way to run Anthropic, external-cloud, and local LLMs.

**Two transports, one UI contract** (`src/bridge/contract.js`). The renderer only ever sees
`UiEvent`s; it never knows which model or transport produced them.

- **chat transport** — direct streaming to any OpenAI- or Anthropic-compatible endpoint. No agent loop.
- **agent transport** — the Claude Agent SDK (tools, MCP, skills, permissions). Phase 2+.

---

## Phase 1 — Real chat, any provider  ← building now

The end-to-end spine. Proves Electron ⇄ main ⇄ provider ⇄ streamed UI.

**Scope**
- Electron shell: `BrowserWindow`, dev/prod loading, lifecycle.
- `window.chai` preload bridge implementing the full `Bridge` contract over IPC.
- `SessionManager` with a working **chat transport**:
  - OpenAI-compatible (`/v1/chat/completions`) — OpenRouter, DeepSeek, Groq, Together, Ollama, LM Studio.
  - Anthropic-compatible (`/v1/messages`) — Anthropic direct, or the free-claude-code proxy.
  - Per-session conversation history (multi-turn).
  - SSE streaming → `assistant_delta` / `result` / `error` UiEvents.
- Provider **profiles** persisted to disk (base URL, kind, api key, model). Switch live.
- Settings panel + live model picker.

**Acceptance**
- Configure any one provider, type a message, watch tokens stream into the Chat tab.
- Switch provider profile without restart; history preserved per session.
- Errors (bad key, 429) surface as a readable `error` event, not a crash.

**Explicitly deferred:** tools, files, MCP, skills, projects persistence.

---

## Phase 2 — The agent (Claude Code / Cowork parity)

**Scope**
- **agent transport** via `@anthropic-ai/claude-agent-sdk`:
  - `query()` driven by the per-mode `Options` presets (ARCHITECTURE.md §3).
  - `ANTHROPIC_BASE_URL` → proxy, so non-Anthropic models can drive the agent.
  - Built-in tools (Read/Write/Edit/Bash/Glob/Grep), `cwd` scoping.
  - `canUseTool` → the existing permission modal; `permissionMode` chip live.
  - MCP servers (Connectors) via `mcpServers`; Skills via a skills dir + `settingSources`.
- Folder access prompt (pick a working directory per Code/Cowork session).

**Acceptance**
- In Claude Code mode over a real repo: ask for a change, watch real tool calls, approve an edit,
  see the file actually change on disk.
- Cowork mode auto-accepts edits and can call a configured MCP connector.

**Risk:** agentic quality tracks model strength. Default agent modes to a capable model
(DeepSeek/Kimi/GLM or Anthropic); keep the proxy swappable (LiteLLM fallback).

---

## Phase 3 — Desktop parity + polish

**Scope**
- **Projects**: persist `{cwd, sessionId, connectorIds, history}`; resume / forkSession.
- **Connectors** UI: add/edit/test MCP servers (stdio + HTTP), toggle per session.
- **Skills** UI: install/enable `SKILL.md` folders.
- **History**: searchable past conversations, rename, delete.
- **UX**: keyboard shortcuts, markdown/code rendering, copy buttons, theme.
- **Packaging**: electron-builder installers (win/mac/linux); secure key storage (OS keychain).

**Acceptance**
- Reopen the app, resume a project mid-thread with its connectors and history intact.
- Ship a signed installer that runs without a dev toolchain.

---

## Provider model (principle 2)

One config schema covers all three model sources — no special cases:

```jsonc
{
  "activeProfileId": "p_openrouter",
  "profiles": {
    "p_anthropic":  { "name": "Anthropic",   "kind": "anthropic", "baseUrl": "https://api.anthropic.com", "apiKey": "sk-ant-…", "model": "claude-sonnet-4-6" },
    "p_openrouter": { "name": "OpenRouter",   "kind": "openai",    "baseUrl": "https://openrouter.ai/api", "apiKey": "sk-or-…",  "model": "deepseek/deepseek-chat" },
    "p_local":      { "name": "LM Studio",    "kind": "openai",    "baseUrl": "http://localhost:1234",     "apiKey": "",         "model": "qwen3-coder" },
    "p_proxy":      { "name": "free-cc proxy","kind": "anthropic", "baseUrl": "http://localhost:8082",     "apiKey": "freecc",   "model": "anthropic/claude-3" }
  }
}
```

`kind` picks the wire format; `baseUrl` picks the destination. Anthropic, cloud, and local all
flow through the same two code paths. The agent transport (Phase 2) reuses the same profiles by
exporting the active one as `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN`.
