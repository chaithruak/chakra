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

  // --- agent ---
  chooseFolder: () => ipcRenderer.invoke("chai:chooseFolder"),

  // --- connectors (MCP) ---
  testConnector: (server) => ipcRenderer.invoke("chai:testConnector", server),

  // --- skills ---
  listSkills: () => ipcRenderer.invoke("chai:listSkills"),
  createSkill: (name) => ipcRenderer.invoke("chai:createSkill", name),
});
