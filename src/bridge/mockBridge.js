// Mock implementation of the Bridge contract. Streams fake UiEvents so the
// renderer layout is fully exercised — including a tool call that pauses on a
// permission_request until the UI calls resolvePermission(). Swap this for the
// real `window.chai` (Electron preload → SessionManager) with no UI changes.

let seq = 0;
const listeners = new Set();
const pendingPermissions = new Map(); // requestId -> resolve fn

function emit(sessionId, kind, data) {
  const e = { sessionId, seq: seq++, kind, data };
  listeners.forEach((cb) => cb(e));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function streamText(sessionId, text, chunk = 3, delay = 18) {
  const words = text.split(" ");
  for (let i = 0; i < words.length; i += chunk) {
    emit(sessionId, "assistant_delta", { text: words.slice(i, i + chunk).join(" ") + " " });
    await sleep(delay);
  }
}

// Canned "turn" that shows off every event kind.
async function runDemoTurn(sessionId, mode, prompt) {
  emit(sessionId, "init", {
    model: "deepseek/deepseek-v3", cwd: "~/projects/chai",
    permissionMode: mode === "cowork" ? "acceptEdits" : "default",
    tools: ["Read", "Write", "Edit", "Bash", "Grep", "Glob"],
  });
  await sleep(250);

  await streamText(sessionId, `Sure — let me look at the project structure for your "${prompt}" request first.`);
  emit(sessionId, "assistant_message", { stop_reason: "tool_use" });

  // A safe read tool — auto-approved.
  const t1 = "tool_" + Math.random().toString(36).slice(2, 7);
  emit(sessionId, "tool_use", { id: t1, name: "Grep", input: { pattern: "SessionManager", glob: "**/*.ts" }, auto: true });
  await sleep(600);
  emit(sessionId, "tool_result", { id: t1, name: "Grep", ok: true, output: "main/session-manager.ts:14: export interface SessionManager {\nmain/session-manager.ts:42:   start(req): Promise<SessionHandle>" });
  await sleep(300);

  await streamText(sessionId, "Found it. I'll add the streaming `sendInput` method now.");
  emit(sessionId, "assistant_message", { stop_reason: "tool_use" });

  // A write tool — needs permission in non-cowork modes.
  const t2 = "tool_" + Math.random().toString(36).slice(2, 7);
  const input = { file_path: "main/session-manager.ts", patch: "+  async sendInput(id, text) { /* streamInput */ }" };
  if (mode === "cowork") {
    // acceptEdits → no prompt
    emit(sessionId, "tool_use", { id: t2, name: "Edit", input, auto: true });
    await sleep(500);
    emit(sessionId, "tool_result", { id: t2, name: "Edit", ok: true, output: "Applied 1 edit to session-manager.ts" });
  } else {
    emit(sessionId, "tool_use", { id: t2, name: "Edit", input, auto: false });
    const allowed = await requestPermission(sessionId, t2, "Edit", input);
    if (allowed) {
      await sleep(500);
      emit(sessionId, "tool_result", { id: t2, name: "Edit", ok: true, output: "Applied 1 edit to session-manager.ts" });
    } else {
      emit(sessionId, "permission_denied", { id: t2, name: "Edit", reason: "User declined" });
      await streamText(sessionId, "Understood — I left the file unchanged.");
      emit(sessionId, "result", { subtype: "success", num_turns: 2, duration_ms: 4200, total_cost_usd: 0.004 });
      return;
    }
  }

  await sleep(250);
  await streamText(sessionId, "Done. The method is wired to `Query.streamInput` for multi-turn input.");
  emit(sessionId, "assistant_message", { stop_reason: "end_turn" });
  emit(sessionId, "result", { subtype: "success", num_turns: 3, duration_ms: 6100, total_cost_usd: 0.006 });
}

function requestPermission(sessionId, toolUseId, toolName, input) {
  const requestId = "perm_" + Math.random().toString(36).slice(2, 8);
  emit(sessionId, "permission_request", { requestId, toolName, input, toolUseId });
  return new Promise((resolve) => pendingPermissions.set(requestId, resolve));
}

export const mockBridge = {
  async start(req) {
    const sessionId = "sess_" + Math.random().toString(36).slice(2, 8);
    runDemoTurn(sessionId, req.mode, req.prompt); // fire and forget; streams events
    return { sessionId };
  },
  async sendInput(sessionId, text) {
    runDemoTurn(sessionId, "code", text);
  },
  async interrupt(sessionId) {
    emit(sessionId, "result", { subtype: "interrupted", num_turns: 1, duration_ms: 0, total_cost_usd: 0 });
  },
  async setPermissionMode() {},
  resolvePermission(requestId, result) {
    const resolve = pendingPermissions.get(requestId);
    if (resolve) { pendingPermissions.delete(requestId); resolve(result.behavior === "allow"); }
  },
  onEvent(cb) { listeners.add(cb); return () => listeners.delete(cb); },

  // --- settings stubs (in-memory) so the UI runs in a plain browser ---
  async getSettings() {
    return _mockSettings;
  },
  async saveSettings(next) {
    _mockSettings = next;
    return next;
  },
  async listModels() {
    return ["deepseek/deepseek-v3", "deepseek/deepseek-r1", "moonshotai/kimi-k2"];
  },
  async chooseFolder() {
    return "/Users/demo/projects/sample"; // mock path in browser
  },
  async testConnector() {
    return { ok: false, error: "Connectors run only in the desktop app." };
  },
  async listSkills() { return []; },
  async createSkill() { return { error: "Skills run only in the desktop app." }; },
  async importSkillFolder() { return { error: "Desktop app only." }; },
  async importSkillZip() { return { error: "Desktop app only." }; },
  async setSkillEnabled() { return true; },
  async deleteSkill() { return { ok: true }; },

  // --- projects (in-memory mock) ---
  async listProjects() { return Object.values(_mockProjects); },
  async getProject(id) { return _mockProjects[id] || null; },
  async createProject(name) { const p = { id: "prj_" + Math.random().toString(36).slice(2, 7), name: name || "Untitled", instructions: "", knowledge: [], createdAt: Date.now() }; _mockProjects[p.id] = p; return p; },
  async updateProject(id, patch) { _mockProjects[id] = { ..._mockProjects[id], ...patch }; return _mockProjects[id]; },
  async deleteProject(id) { delete _mockProjects[id]; return true; },
  async addKnowledgeText(projectId, name, content) { const p = _mockProjects[projectId]; p.knowledge.push({ id: "kn_" + Math.random().toString(36).slice(2, 6), name, type: "text", content }); return p; },
  async addKnowledgeFile() { return { error: "Desktop app only." }; },
  async removeKnowledge(projectId, knId) { const p = _mockProjects[projectId]; p.knowledge = p.knowledge.filter((k) => k.id !== knId); return p; },
  async listConversations(projectId) { return Object.values(_mockConvs).filter((c) => c.projectId === projectId); },
  async getConversation(id) { return _mockConvs[id] || null; },
  async createConversation(projectId) { const c = { id: "cnv_" + Math.random().toString(36).slice(2, 7), projectId, title: "New conversation", messages: [], updatedAt: Date.now() }; _mockConvs[c.id] = c; return c; },
  async deleteConversation(id) { delete _mockConvs[id]; return true; },
};
const _mockProjects = {};
const _mockConvs = {};

let _mockSettings = {
  activeProfileId: "p_demo",
  profiles: {
    p_demo: { id: "p_demo", name: "Demo (mock)", kind: "openai", baseUrl: "http://localhost:1234", apiKey: "", model: "deepseek/deepseek-v3" },
  },
};

// In the real app: export const bridge = window.chai ?? mockBridge;
export const bridge = mockBridge;
