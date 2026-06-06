// Exposes window.chai — the real Bridge (mirrors src/bridge/contract.js).
const { contextBridge, ipcRenderer } = require("electron");

const listeners = new Set();
ipcRenderer.on("chai:event", (_e, uiEvent) => {
  listeners.forEach((cb) => cb(uiEvent));
});

contextBridge.exposeInMainWorld("chai", {
  // --- Bridge contract ---
  start: (req) => ipcRenderer.invoke("chai:start", req),
  sendInput: (sessionId, text) => ipcRenderer.invoke("chai:sendInput", { sessionId, text }),
  interrupt: (sessionId) => ipcRenderer.invoke("chai:interrupt", { sessionId }),
  setPermissionMode: (sessionId, mode) => ipcRenderer.invoke("chai:setPermissionMode", { sessionId, mode }),
  resolvePermission: (requestId, result) => ipcRenderer.send("chai:resolvePermission", { requestId, result }),
  onEvent: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },

  // --- settings / models ---
  getSettings: () => ipcRenderer.invoke("chai:getSettings"),
  saveSettings: (next) => ipcRenderer.invoke("chai:saveSettings", next),
  listModels: (profileId) => ipcRenderer.invoke("chai:listModels", profileId),
  pingProvider: (profileId) => ipcRenderer.invoke("chai:pingProvider", profileId),

  // --- account / sign-in ---
  saveAccount: (account) => ipcRenderer.invoke("chai:saveAccount", account),
  signOut: () => ipcRenderer.invoke("chai:signOut"),
  googleSignIn: () => ipcRenderer.invoke("chai:googleSignIn"),
  linkAnthropic: () => ipcRenderer.invoke("chai:linkAnthropic"),

  // --- agent ---
  chooseFolder: () => ipcRenderer.invoke("chai:chooseFolder"),

  // --- connectors (MCP) ---
  testConnector: (server) => ipcRenderer.invoke("chai:testConnector", server),

  // --- skills ---
  listSkills: () => ipcRenderer.invoke("chai:listSkills"),
  createSkill: (name) => ipcRenderer.invoke("chai:createSkill", name),
  importSkillFolder: () => ipcRenderer.invoke("chai:importSkillFolder"),
  importSkillZip: () => ipcRenderer.invoke("chai:importSkillZip"),
  setSkillEnabled: (dir, enabled) => ipcRenderer.invoke("chai:setSkillEnabled", { dir, enabled }),
  deleteSkill: (dir) => ipcRenderer.invoke("chai:deleteSkill", dir),

  // --- projects ---
  listProjects: () => ipcRenderer.invoke("chai:listProjects"),
  getProject: (id) => ipcRenderer.invoke("chai:getProject", id),
  createProject: (name) => ipcRenderer.invoke("chai:createProject", name),
  updateProject: (id, patch) => ipcRenderer.invoke("chai:updateProject", { id, patch }),
  deleteProject: (id) => ipcRenderer.invoke("chai:deleteProject", id),
  addKnowledgeText: (projectId, name, content) => ipcRenderer.invoke("chai:addKnowledgeText", { projectId, name, content }),
  addKnowledgeFile: (projectId) => ipcRenderer.invoke("chai:addKnowledgeFile", projectId),
  removeKnowledge: (projectId, knId) => ipcRenderer.invoke("chai:removeKnowledge", { projectId, knId }),
  linkProjectFolder: (projectId) => ipcRenderer.invoke("chai:linkProjectFolder", projectId),
  linkGithub: (projectId, url) => ipcRenderer.invoke("chai:linkGithub", { projectId, url }),
  pullGithub: (projectId) => ipcRenderer.invoke("chai:pullGithub", projectId),
  unlinkProjectSource: (projectId) => ipcRenderer.invoke("chai:unlinkProjectSource", projectId),
  listConversations: (projectId) => ipcRenderer.invoke("chai:listConversations", projectId),
  getConversation: (id) => ipcRenderer.invoke("chai:getConversation", id),
  createConversation: (projectId) => ipcRenderer.invoke("chai:createConversation", projectId),
  deleteConversation: (id) => ipcRenderer.invoke("chai:deleteConversation", id),

  // --- dispatch (background + scheduled tasks) ---
  listTasks: () => ipcRenderer.invoke("chai:listTasks"),
  createTask: () => ipcRenderer.invoke("chai:createTask"),
  updateTask: (id, patch) => ipcRenderer.invoke("chai:updateTask", { id, patch }),
  deleteTask: (id) => ipcRenderer.invoke("chai:deleteTask", id),
  getRuns: (id) => ipcRenderer.invoke("chai:getRuns", id),
  runTaskNow: (id) => ipcRenderer.invoke("chai:runTaskNow", id),

  // --- usage ---
  getUsage: (days) => ipcRenderer.invoke("chai:getUsage", days),
});
