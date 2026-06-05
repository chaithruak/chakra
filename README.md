# Chai — renderer layout mock

A runnable React mock of the desktop UI from `../claude-ui/ARCHITECTURE.md`. It renders the full
layout — tab/mode shell, model picker, streaming message list, tool-call cards, and the permission
modal — driven entirely by the **`UiEvent`** contract, so wiring it to the real Electron
`SessionManager` later means swapping one line.

## Run

Browser-only UI (mock bridge, fake data):

```bash
cd Chai
npm install
npm run dev          # http://localhost:5174
```

Full desktop app (Phase 1 — real streaming to any provider):

```bash
npm install
npm run electron:dev # launches Electron + Vite together
```

Then open **Settings** in the app, fill in a provider profile (base URL, API key, model),
click **Set active**, and start a Chat session. Works with Anthropic, OpenRouter/DeepSeek/Groq,
local Ollama/LM Studio, or the free-claude-code proxy — pick the wire format per profile.

See `ROADMAP.md` for the 3-phase plan. Phase 1 (chat over any provider) is implemented; the
agent transport (tools/MCP/skills) is Phase 2.

## What's mocked vs real

- **Real:** the UI, and the `Bridge` contract (`src/bridge/contract.js`) — identical to what the
  Electron preload will expose as `window.chai`.
- **Mocked:** `src/bridge/mockBridge.js` streams canned `UiEvent`s (including a tool call that pauses
  on a `permission_request`). Replace with `export const bridge = window.chai ?? mockBridge;`.

## Try it

1. Pick **Claude Code** mode → send a message → watch streaming + a `Grep` tool auto-run.
2. The `Edit` tool triggers the **permission modal** — Decline to see the declined path, Allow to continue.
3. Switch to **Cowork** mode → the same `Edit` runs without a prompt (`acceptEdits`).
4. Open the **model picker** (top-right) to search/switch models.

## Map to the spec

| File | Spec section |
|------|--------------|
| `src/bridge/contract.js` | §4 UiEvent envelope + command channels |
| `src/bridge/mockBridge.js` | stand-in for §2 SessionManager |
| `src/App.jsx` | §4.2 SDK-event → UI reduction |
| `src/components/PermissionModal.jsx` | `canUseTool` / `PermissionResult` round-trip |

Next step: build the Electron main process + real `SessionManager` (Agent SDK) and expose `window.chai`.
