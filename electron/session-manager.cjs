// SessionManager (main process).
//  - chat mode  → direct streaming transport (providers.cjs)
//  - cowork/code → agent transport (agent-transport.cjs, Claude Agent SDK)
// Both emit normalized UiEvents via emit().
const { streamChat } = require("./providers.cjs");
const { runAgentTurn } = require("./agent-transport.cjs");
const { runOpenAIAgentTurn } = require("./agent-openai.cjs");
const settings = require("./settings.cjs");
const store = require("./projects-store.cjs");

let seq = 0;
const AGENT_MODES = new Set(["cowork", "code"]);

class SessionManager {
  constructor(emit) {
    this.rawEmit = emit;                 // (uiEvent) => void
    this.sessions = new Map();           // sessionId -> { mode, cwd, history, controller, sdkSessionId }
    this.permissions = new Map();        // requestId -> resolve(PermissionResult)
    this.holds = new Map();              // sessionId -> SDK Query (for interrupt)
  }

  _send(sessionId, kind, data) {
    this.rawEmit({ sessionId, seq: seq++, kind, data });
  }

  async start(req) {
    const sessionId = "sess_" + Math.random().toString(36).slice(2, 9);
    const s = { mode: req.mode, cwd: req.cwd, history: [], controller: null, sdkSessionId: null, permMode: req.permissionMode || "default" };
    if (req.mode === "project") {
      s.projectId = req.projectId;
      s.conversationId = req.conversationId;
      const conv = store.getConversation(req.conversationId);
      s.history = [{ role: "system", content: "" }, ...((conv && conv.messages) || [])]; // index 0 reserved for project system
    }
    this.sessions.set(sessionId, s);
    await this._turn(sessionId, req.prompt);
    return { sessionId };
  }

  async sendInput(sessionId, text) {
    if (this.sessions.get(sessionId)) await this._turn(sessionId, text);
  }

  async _turn(sessionId, userText) {
    const s = this.sessions.get(sessionId);
    const profile = settings.activeProfile();
    if (!profile || !profile.baseUrl) {
      this._send(sessionId, "error", { code: "no_profile", message: "No provider configured. Open Settings." });
      return;
    }

    // Diagnostic: shows in the [ELECTRON] terminal exactly which profile is active.
    const keyLen = (profile.apiKey || "").length;
    console.log(`[chakra] turn → provider="${profile.name}" kind=${profile.kind} model="${profile.model}" baseUrl=${profile.baseUrl} keyLen=${keyLen}`);

    // Clear guard instead of a cryptic upstream 401.
    const isLocal = /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(profile.baseUrl || "");
    if (!isLocal && keyLen === 0) {
      this._send(sessionId, "error", {
        code: "no_key",
        message: `No API key on the ACTIVE provider "${profile.name}". Open Settings, click "${profile.name}", paste its key, and make sure it's the one selected in the top-bar model picker.`,
      });
      return;
    }

    if (s.mode === "project") return this._projectTurn(sessionId, userText, profile);
    if (AGENT_MODES.has(s.mode)) return this._agentTurn(sessionId, userText, profile);

    // Chat: if skills/connectors are configured and the model speaks OpenAI tools,
    // run the lightweight tool loop (skills + connectors, no file/shell). Else plain chat.
    const cfg = settings.load();
    const hasExtras = (cfg.skillsDirs || []).length > 0 || (cfg.connectors || []).some((c) => c.enabled);
    if (profile.kind !== "anthropic" && hasExtras) {
      return this._chatAgentTurn(sessionId, userText, profile, cfg);
    }
    return this._chatTurn(sessionId, userText, profile);
  }

  // Chat enriched with skills + connectors (OpenAI-compatible providers).
  async _chatAgentTurn(sessionId, userText, profile, cfg) {
    const s = this.sessions.get(sessionId);
    const controller = new AbortController();
    s.controller = controller;
    const emit = (e) => this._send(sessionId, e.kind, e.data);
    try {
      await runOpenAIAgentTurn({
        prompt: userText, mode: "chat", cwd: null, profile, permMode: "default",
        history: s.history, emit, permissions: this.permissions, signal: controller.signal,
        connectors: cfg.connectors || [], skillsDir: cfg.skillsDirs || [], disabledSkills: cfg.disabledSkills || [],
      });
    } finally {
      s.controller = null;
    }
  }

  // ---- chat transport ----
  async _chatTurn(sessionId, userText, profile) {
    const s = this.sessions.get(sessionId);
    s.history.push({ role: "user", content: userText });
    const controller = new AbortController();
    s.controller = controller;
    this._send(sessionId, "init", { model: profile.model, provider: profile.name, kind: profile.kind, mode: s.mode });
    const messages = [{ role: "system", content: "You are Chakra, a helpful assistant." }, ...s.history];
    const started = Date.now();
    try {
      const { text } = await streamChat(profile, messages, {
        signal: controller.signal,
        onDelta: (d) => this._send(sessionId, "assistant_delta", { text: d }),
      });
      s.history.push({ role: "assistant", content: text });
      this._send(sessionId, "assistant_message", { stop_reason: "end_turn" });
      this._send(sessionId, "result", { subtype: "success", num_turns: 1, duration_ms: Date.now() - started, total_cost_usd: 0 });
    } catch (err) {
      if (err.name === "AbortError") this._send(sessionId, "result", { subtype: "interrupted", duration_ms: Date.now() - started });
      else this._send(sessionId, "error", { code: err.code || "error", message: String(err.message || err) });
    } finally {
      s.controller = null;
    }
  }

  // ---- project conversations (persisted, knowledge-grounded chat) ----
  async _projectTurn(sessionId, userText, profile) {
    const s = this.sessions.get(sessionId);
    const project = store.getProject(s.projectId);
    if (!project) { this._send(sessionId, "error", { code: "no_project", message: "Project not found." }); return; }
    const sys = store.projectSystem(project);
    const cfg = settings.load();
    const emit = (e) => this._send(sessionId, e.kind, e.data);
    const controller = new AbortController();
    s.controller = controller;

    // index 0 is the project system message; keep it current each turn
    if (!s.history.length) s.history.push({ role: "system", content: sys });
    else if (s.history[0].role === "system") s.history[0].content = sys;
    else s.history.unshift({ role: "system", content: sys });

    try {
      if (profile.kind === "anthropic") {
        s.history.push({ role: "user", content: userText });
        emit({ kind: "init", data: { model: profile.model, mode: "project", provider: profile.name } });
        const started = Date.now();
        const { text } = await streamChat(profile, s.history, {
          signal: controller.signal,
          onDelta: (d) => emit({ kind: "assistant_delta", data: { text: d } }),
        });
        s.history.push({ role: "assistant", content: text });
        emit({ kind: "assistant_message", data: { stop_reason: "end_turn" } });
        emit({ kind: "result", data: { subtype: "success", duration_ms: Date.now() - started } });
      } else {
        await runOpenAIAgentTurn({
          prompt: userText, mode: "chat", cwd: null, profile, permMode: "default",
          history: s.history, emit, permissions: this.permissions, signal: controller.signal,
          connectors: cfg.connectors || [], skillsDir: cfg.skillsDirs || [], disabledSkills: cfg.disabledSkills || [],
          systemOverride: sys,
        });
      }
    } catch (e) {
      if (e.name === "AbortError") emit({ kind: "result", data: { subtype: "interrupted" } });
      else emit({ kind: "error", data: { code: e.code || "error", message: String(e.message || e) } });
    } finally {
      s.controller = null;
      const msgs = s.history.filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.length);
      const conv = store.getConversation(s.conversationId) || { id: s.conversationId, projectId: s.projectId, title: "New conversation", createdAt: Date.now() };
      conv.messages = msgs;
      if (conv.title === "New conversation") {
        const fu = msgs.find((m) => m.role === "user");
        if (fu) conv.title = String(fu.content).slice(0, 48);
      }
      store.saveConversation(conv);
    }
  }

  // ---- agent transport (routed by profile kind) ----
  async _agentTurn(sessionId, userText, profile) {
    const s = this.sessions.get(sessionId);
    if (!s.cwd) {
      this._send(sessionId, "error", { code: "no_folder", message: "Pick a working folder first (Choose folder)." });
      return;
    }
    const emit = (e) => this._send(sessionId, e.kind, e.data);

    if (profile.kind === "anthropic") {
      // Anthropic (or a proxy): full Claude Agent SDK.
      s.sdkSessionId = await runAgentTurn({
        sessionId, prompt: userText, mode: s.mode, cwd: s.cwd, profile, permMode: s.permMode,
        resume: s.sdkSessionId, emit, permissions: this.permissions, holds: this.holds,
      });
    } else {
      // External OpenAI-compatible model (NIM/OpenRouter/local): Chakra's own loop.
      const controller = new AbortController();
      s.controller = controller;
      try {
        const cfg = settings.load();
        await runOpenAIAgentTurn({
          prompt: userText, mode: s.mode, cwd: s.cwd, profile, permMode: s.permMode,
          history: s.history, emit, permissions: this.permissions, signal: controller.signal,
          connectors: cfg.connectors || [], skillsDir: cfg.skillsDirs || [], disabledSkills: cfg.disabledSkills || [],
        });
      } finally {
        s.controller = null;
      }
    }
  }

  async interrupt(sessionId) {
    const s = this.sessions.get(sessionId);
    const q = this.holds.get(sessionId);
    if (q && typeof q.interrupt === "function") { try { await q.interrupt(); } catch {} }
    if (s && s.controller) s.controller.abort();
  }

  async setPermissionMode(sessionId, mode) {
    const s = this.sessions.get(sessionId);
    if (s) s.permMode = mode;
  }

  resolvePermission(requestId, result) {
    const resolve = this.permissions.get(requestId);
    if (resolve) { this.permissions.delete(requestId); resolve(result || { behavior: "deny" }); }
  }
}

module.exports = { SessionManager };
