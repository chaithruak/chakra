# Chakra — Project Memory

> Resume file. If the chat is lost, read this first to pick up exactly where we left off.
> Last updated: end of Phase 3 Skills (multi-folder + import).

---

## 1. What Chakra is

A desktop app (Electron + React + Vite) that **replicates Claude Desktop's functionality — Chat,
Cowork, Code, Projects, Skills, Connectors — but runs on ANY LLM** (Anthropic, external cloud like
OpenRouter/NIM, or local Ollama/LM Studio). Built by Chaithrodaya Sukruth (chaithru@gmail.com).

Two guiding principles:
1. Match Claude Cowork's features.
2. Simple, efficient, flexible use of Anthropic + external + local models — **no proxy required**.

Origin: inspired by `free-claude-code` (a CLI proxy). We deliberately did NOT use a proxy — Chakra
talks to providers directly and runs its own agent loop.

## 2. Locations / run / commit

- Repo (local): `C:\Projects\ClaudeCodeUI\Chakra`
- GitHub remote: `https://github.com/chaithruak/chakra.git` (branch `main`)
- Settings file at runtime: `%APPDATA%\chakra\chai-settings.json`
- Run (browser UI, mock data): `npm install` then `npm run dev` (http://localhost:5174)
- Run (full desktop app): `npm run electron:dev`
- **Main-process changes (electron/*.cjs) require a FULL restart** (Ctrl+C then `npm run electron:dev`);
  renderer changes (src/**) hot-reload.
- Commit (PowerShell 5 has NO `&&` — separate lines):
  ```
  git add -A
  git commit -m "message"
  git push
  ```
- `.gitignore` excludes node_modules/dist/release. NEVER commit node_modules (electron.exe + claude.exe
  are >100MB and GitHub rejects them).

## 3. Architecture

```
React UI (src/) ──IPC── Electron main (electron/) ── providers / agent loops ── LLM + MCP + skills
```

- **Bridge**: renderer talks to main via `window.chai` (electron/preload.cjs), abstracted in
  `src/bridge/index.js` (= window.chai, or mockBridge in a plain browser). The contract is in
  `src/bridge/contract.js`. All UI events flow as normalized `UiEvent`s (kinds: init, assistant_delta,
  assistant_message, tool_use, tool_result, permission_request, permission_denied, result, error).
- **Provider profiles**: each profile = { id, name, kind ("openai"|"anthropic"), baseUrl, apiKey, model }.
  `kind` picks the wire format; baseUrl picks destination. Stored in settings.profiles; one is active.
- **Modes** (one engine, different presets):
  - `chat` → plain streaming (providers.streamChat). If skills/connectors configured AND profile is
    openai-kind, routed through the tool loop (skills + connectors, no file/shell, streaming on).
  - `code` / `cowork` / `project` → agent loop with file/shell tools.
- **Two agent transports**, routed by profile kind in session-manager `_agentTurn`:
  - openai-kind → `electron/agent-openai.cjs` (Chakra's OWN tool-calling loop — this is the main path
    for external models, the user's objective).
  - anthropic-kind → `electron/agent-transport.cjs` (Claude Agent SDK, for Anthropic or a proxy).
- **Permission modes** (user-selectable in top bar): `default` (ask before changes), `acceptEdits`
  (auto edits, ask for bash), `bypassPermissions` (act, trust all), `plan` (read-only). Enforced in
  both transports. Reads + load_skill are always auto.
- **Connectors (MCP)**: `electron/mcp-manager.cjs` connects stdio MCP servers, exposes their tools as
  OpenAI function schemas (`mcp__<server>__<tool>`), routes calls back. MCP tools always ask unless bypass.
- **Skills** (Claude-style progressive disclosure): `electron/skills-manager.cjs` recursively scans one
  or more skill folders for SKILL.md (frontmatter name/description). The lightweight index is injected
  into the system prompt every turn (real-time); the agent calls a `load_skill` tool to pull full
  instructions, then runs bundled scripts via run_bash. Works in ALL modes.

## 4. Phase status

- **Phase 1 — DONE**: multi-provider chat, streaming, live model discovery via /v1/models, provider
  profiles, Settings panel.
- **Phase 2 — DONE**: Cowork/Code agent on external models (own loop), permission modes, Cowork-style
  tool cards + permission modal, folder picker.
- **Phase 3 — IN PROGRESS**:
  - DONE: Connectors (MCP) — manager, agent integration, IPC, Connectors UI. (Tested: works.)
  - DONE: Skills — manager, progressive disclosure across chat/code/cowork/project, Skills UI. (Tested: works.)
  - DONE (pending test): multi skill folders + recursive discovery + real-time index refresh + import
    (folder + .zip/.skill). Lets you also point at Claude's skills folder.
  - NOT STARTED: Projects persistence (save/resume sessions across restarts — currently "project" is an
    agent mode but nothing persists), searchable history, polish (real diffs, stop button, markdown
    rendering), installer (electron-builder).

## 5. File map

electron/ (main process, CommonJS .cjs):
- `main.cjs` — BrowserWindow, all IPC handlers (start/sendInput/interrupt/permission, settings, models,
  chooseFolder, testConnector, listSkills/createSkill/importSkillFolder/importSkillZip).
- `preload.cjs` — exposes window.chai.
- `session-manager.cjs` — per-session state; routes modes to chat / chat-with-tools / agent transports;
  permission resolve/interrupt; passes connectors + skillsDirs.
- `providers.cjs` — streamChat (OpenAI + Anthropic SSE), streamChatTools (OpenAI tool-calling stream),
  listModels.
- `agent-openai.cjs` — the self-built tool loop (file/shell tools, MCP, skills, permissions). MAIN path.
- `agent-transport.cjs` — Claude Agent SDK wrapper (anthropic-kind only).
- `mcp-manager.cjs` — MCP client (connect/openAiTools/callTool/testServer/disconnectAll).
- `skills-manager.cjs` — discover (recursive, multi-dir)/indexText/loadSkill/createStarter.
- `settings.cjs` — load/save/activeProfile; DEFAULTS; migrates skillsDir→skillsDirs.

src/ (renderer, React):
- `App.jsx` — top-level state, UiEvent reducer → timeline, mode routing, model picker, permission change.
- `bridge/{contract.js,index.js,mockBridge.js}`.
- `components/`: Sidebar, Topbar (+ ModelPicker + PermissionPicker), Message, ToolCard (Cowork-style),
  PermissionModal, Composer, Settings (providers), Connectors (MCP), Skills.
- `styles.css` — dark terracotta theme.

Docs: `ARCHITECTURE.md` (Session Manager spec — note it predates Chakra rename, still says "Chai" in
places), `ROADMAP.md` (3-phase plan), `README.md`, this `MEMORY.md`.

## 6. Key decisions & gotchas

- App display name = **Chakra**; was renamed from "Chai" (some docs/comments still say Chai — harmless).
- Settings clobber bug (FIXED): App and Settings panels both wrote settings; the model picker overwrote
  the file with a stale copy, wiping providers/keys. Fix: every write re-reads from disk first
  (App.selectModel does `bridge.getSettings()` before saving). Keep this pattern for any new writer.
- Agent claimed "Created folder" BEFORE approval (FIXED): in agent-openai, pre-tool assistant text is
  suppressed; only the FINAL answer (no tool calls) is shown. Chat streams live (no mutating tools).
- Weak models dump raw JSON / don't list results: system prompt tells them to present results readably
  but never paste JSON; Message.jsx `cleanAssistant` also strips a leading JSON blob. Quality tracks the
  model — use tool-capable models (DeepSeek, Qwen-Coder, Kimi, Llama-instruct) for agent/skill inference.
- Agent (cowork/code) needs an openai-kind profile for external models, OR anthropic-kind for the SDK
  path. Pure NIM/OpenRouter are openai-kind → use the self-built loop.

## 7. ENVIRONMENT QUIRKS (important when working via the sandbox)

- The bash workspace mount frequently serves **truncated reads** → `node --check` shows false-positive
  syntax errors (blank/cut lines, `node:fs:440` EIO). The host files (via Read/Write tools) are the
  source of truth and are fine. Verify suspicious files by Reading them on the host, not by trusting
  bash node --check.
- The user is on Windows + **PowerShell 5** (no `&&`). Give commands as separate lines.
- Electron + the Agent SDK bundle large native binaries that download on install; if blocked, set a
  mirror or extract manually (we hit this — see git history).

## 8. Next steps (pick up here)

1. Verify the latest Skills changes on the user's machine: `npm run electron:dev`, open Skills, add a
   folder, Create / Import a skill, confirm it lists and triggers. Then commit.
2. Then: **Projects persistence** (save {cwd, history, connectorIds, sessionId} to disk; resume/list;
   searchable history) OR **polish** (edit diffs, stop button, markdown rendering). User leaned Projects.
3. Later: installer (electron-builder), OS-keychain key storage.

## 9. Commit checkpoints so far

- "Chakra: chat + Cowork on external models, permission modes, Cowork-style UI"
- "Phase 3: MCP connectors working"
- "Phase 3: Skills across chat, code, cowork, projects"
- (pending) multi-folder skills + import + real-time index refresh
