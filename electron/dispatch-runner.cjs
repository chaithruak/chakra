// Dispatch runner — executes a task headlessly (no UI session), capturing the output.
// Runs unattended, so it uses permission mode "bypass" (auto-approves tools).
const { streamChat } = require("./providers.cjs");
const { runOpenAIAgentTurn } = require("./agent-openai.cjs");
const settings = require("./settings.cjs");
const store = require("./projects-store.cjs");

async function runTask(task) {
  const profile = settings.activeProfile();
  if (!profile || !profile.baseUrl) return { status: "error", output: "No provider configured." };
  const cfg = settings.load();
  const target = task.target || { type: "chat" };

  let text = "";
  const notes = [];
  const emit = (e) => {
    if (e.kind === "assistant_delta") text += e.data.text || "";
    else if (e.kind === "tool_use") notes.push("· used " + e.data.name);
    else if (e.kind === "error") notes.push("ERROR: " + (e.data.message || ""));
  };
  const permissions = new Map();
  const history = [];

  const agent = (opts) => runOpenAIAgentTurn({
    prompt: task.prompt, profile, permMode: "bypass", history, emit, permissions,
    connectors: cfg.connectors || [], skillsDir: cfg.skillsDirs || [], disabledSkills: cfg.disabledSkills || [],
    ...opts,
  });

  try {
    if (target.type === "project") {
      const project = store.getProject(target.projectId);
      if (!project) return { status: "error", output: "Project not found." };
      const sys = store.projectSystem(project) + (project.folder ? `\n\nLinked folder: ${project.folder}` : "");
      if (profile.kind === "anthropic") {
        const r = await streamChat(profile, [{ role: "system", content: sys }, { role: "user", content: task.prompt }], { onDelta: () => {} });
        text = r.text;
      } else {
        await agent({ mode: project.folder ? "cowork" : "chat", cwd: project.folder || null, systemOverride: sys });
      }
    } else if (target.type === "folder" && target.folder) {
      if (profile.kind === "anthropic") return { status: "error", output: "Folder tasks need an OpenAI-compatible provider." };
      await agent({ mode: "cowork", cwd: target.folder });
    } else {
      // plain chat
      const hasExtras = (cfg.skillsDirs || []).length || (cfg.connectors || []).some((c) => c.enabled);
      if (profile.kind === "anthropic" || !hasExtras) {
        const r = await streamChat(profile, [{ role: "system", content: "You are Chai." }, { role: "user", content: task.prompt }], { onDelta: () => {} });
        text = r.text;
      } else {
        await agent({ mode: "chat", cwd: null });
      }
    }
    const out = (text.trim() || notes.join("\n") || "(no output)").slice(0, 20000);
    return { status: "success", output: out };
  } catch (e) {
    return { status: "error", output: String((e && e.message) || e).slice(0, 2000) };
  }
}

module.exports = { runTask };
