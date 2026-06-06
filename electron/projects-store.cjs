// Projects store — Claude-Projects-style workspaces persisted to disk.
// A project has: name, custom instructions, knowledge (text/files injected as context),
// and a set of conversations whose messages persist across restarts.
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const rand = (p) => p + Math.random().toString(36).slice(2, 9);
const baseDir = () => path.join(app.getPath("userData"), "projects-data");
const convDir = () => path.join(baseDir(), "conversations");
const projFile = () => path.join(baseDir(), "projects.json");
const ensure = () => fs.mkdirSync(convDir(), { recursive: true });

function loadProjects() { try { return JSON.parse(fs.readFileSync(projFile(), "utf8")).projects || []; } catch { return []; } }
function saveProjects(arr) { ensure(); fs.writeFileSync(projFile(), JSON.stringify({ projects: arr }, null, 2)); }

function listProjects() {
  return loadProjects().map((p) => ({ id: p.id, name: p.name, instructions: p.instructions, createdAt: p.createdAt, knowledgeCount: (p.knowledge || []).length }));
}
function getProject(id) { return loadProjects().find((p) => p.id === id) || null; }
function createProject(name) {
  const p = { id: rand("prj_"), name: name || "Untitled project", instructions: "", knowledge: [], createdAt: Date.now() };
  const arr = loadProjects(); arr.unshift(p); saveProjects(arr); return p;
}
function updateProject(id, patch) {
  const arr = loadProjects(); const i = arr.findIndex((p) => p.id === id); if (i < 0) return null;
  arr[i] = { ...arr[i], ...patch }; saveProjects(arr); return arr[i];
}
function deleteProject(id) {
  saveProjects(loadProjects().filter((p) => p.id !== id));
  for (const c of rawConversations()) if (c.projectId === id) deleteConversation(c.id);
  return true;
}

// ---- knowledge ----
function addKnowledge(projectId, item) {
  const arr = loadProjects(); const p = arr.find((x) => x.id === projectId); if (!p) return null;
  p.knowledge = p.knowledge || [];
  p.knowledge.push({ id: rand("kn_"), name: item.name || "untitled", type: item.type || "text", content: String(item.content || "").slice(0, 200000) });
  saveProjects(arr); return p;
}
function removeKnowledge(projectId, knId) {
  const arr = loadProjects(); const p = arr.find((x) => x.id === projectId); if (!p) return null;
  p.knowledge = (p.knowledge || []).filter((k) => k.id !== knId); saveProjects(arr); return p;
}

// System prompt = instructions + knowledge, injected into every conversation in the project.
function projectSystem(project) {
  let s = `You are Chai, a helpful AI assistant working within the project "${project.name}".`;
  if (project.instructions) s += `\n\nProject instructions:\n${project.instructions}`;
  const kn = project.knowledge || [];
  if (kn.length) s += `\n\nProject knowledge (reference material you can use):\n` + kn.map((k) => `### ${k.name}\n${k.content}`).join("\n\n");
  s += `\n\nReply clearly in natural language; never paste raw JSON or tool syntax.`;
  return s;
}

// ---- conversations ----
const convFile = (id) => path.join(convDir(), id + ".json");
function rawConversations() {
  ensure(); const out = [];
  for (const f of fs.readdirSync(convDir())) {
    if (!f.endsWith(".json")) continue;
    try { out.push(JSON.parse(fs.readFileSync(path.join(convDir(), f), "utf8"))); } catch {}
  }
  return out;
}
function listConversations(projectId) {
  return rawConversations().filter((c) => c.projectId === projectId)
    .map((c) => ({ id: c.id, projectId: c.projectId, title: c.title, updatedAt: c.updatedAt, count: (c.messages || []).length }))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}
function getConversation(id) { try { return JSON.parse(fs.readFileSync(convFile(id), "utf8")); } catch { return null; } }
function createConversation(projectId) {
  const c = { id: rand("cnv_"), projectId, title: "New conversation", messages: [], createdAt: Date.now(), updatedAt: Date.now() };
  saveConversation(c); return c;
}
function saveConversation(c) { ensure(); c.updatedAt = Date.now(); fs.writeFileSync(convFile(c.id), JSON.stringify(c, null, 2)); return c; }
function deleteConversation(id) { try { fs.unlinkSync(convFile(id)); } catch {} return true; }

module.exports = {
  listProjects, getProject, createProject, updateProject, deleteProject,
  addKnowledge, removeKnowledge, projectSystem,
  listConversations, getConversation, createConversation, saveConversation, deleteConversation,
};
