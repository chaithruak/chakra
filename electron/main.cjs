const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync } = require("child_process");
const settings = require("./settings.cjs");
const { SessionManager } = require("./session-manager.cjs");
const { listModels } = require("./providers.cjs");
const mcp = require("./mcp-manager.cjs");
const skillsMgr = require("./skills-manager.cjs");
const store = require("./projects-store.cjs");

const isDev = process.env.NODE_ENV === "development";
let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 880,
    minHeight: 560,
    backgroundColor: "#0e0f11",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5174");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

// One SessionManager; it pushes UiEvents to the focused renderer.
const sm = new SessionManager((uiEvent) => {
  if (win && !win.isDestroyed()) win.webContents.send("chai:event", uiEvent);
});

// ---- IPC: commands (renderer → main) ----
ipcMain.handle("chai:start", (_e, req) => sm.start(req));
ipcMain.handle("chai:sendInput", (_e, { sessionId, text }) => sm.sendInput(sessionId, text));
ipcMain.handle("chai:interrupt", (_e, { sessionId }) => sm.interrupt(sessionId));
ipcMain.handle("chai:setPermissionMode", (_e, { sessionId, mode }) => sm.setPermissionMode(sessionId, mode));
ipcMain.on("chai:resolvePermission", (_e, { requestId, result }) => sm.resolvePermission(requestId, result));

// ---- IPC: settings + models ----
ipcMain.handle("chai:getSettings", () => settings.load());
ipcMain.handle("chai:saveSettings", (_e, next) => settings.save(next));
ipcMain.handle("chai:listModels", async (_e, profileId) => {
  const s = settings.load();
  const p = profileId ? s.profiles[profileId] : settings.activeProfile(s);
  try { return await listModels(p); } catch { return []; }
});

// ---- IPC: folder picker (for Cowork/Code working directory) ----
ipcMain.handle("chai:chooseFolder", async () => {
  const r = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
  return r.canceled ? null : r.filePaths[0];
});

// ---- IPC: connectors (MCP) ----
ipcMain.handle("chai:testConnector", (_e, server) => mcp.testServer(server));

// ---- IPC: skills ----
ipcMain.handle("chai:listSkills", () => {
  const cfg = settings.load();
  const disabled = new Set(cfg.disabledSkills || []);
  return skillsMgr.discover(cfg.skillsDirs).map((s) => ({ ...s, enabled: !disabled.has(s.dir) }));
});
ipcMain.handle("chai:setSkillEnabled", (_e, { dir, enabled }) => {
  const cfg = settings.load();
  const set = new Set(cfg.disabledSkills || []);
  if (enabled) set.delete(dir); else set.add(dir);
  settings.save({ ...cfg, disabledSkills: [...set] });
  return true;
});
ipcMain.handle("chai:deleteSkill", (_e, dir) => {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    const cfg = settings.load();
    settings.save({ ...cfg, disabledSkills: (cfg.disabledSkills || []).filter((d) => d !== dir) });
    return { ok: true };
  } catch (e) { return { error: String(e.message || e) }; }
});
ipcMain.handle("chai:createSkill", (_e, name) => {
  const dir = (settings.load().skillsDirs || [])[0];
  if (!dir) return { error: "Add a skills folder first." };
  try { return skillsMgr.createStarter(dir, name); } catch (e) { return { error: String(e.message || e) }; }
});

// Import a skill by copying a folder (must contain SKILL.md somewhere) into the first skills folder.
ipcMain.handle("chai:importSkillFolder", async () => {
  const dest = (settings.load().skillsDirs || [])[0];
  if (!dest) return { error: "Add a skills folder first." };
  const r = await dialog.showOpenDialog(win, { properties: ["openDirectory"], title: "Select a skill folder (contains SKILL.md)" });
  if (r.canceled) return { canceled: true };
  const src = r.filePaths[0];
  try {
    const target = path.join(dest, path.basename(src));
    fs.cpSync(src, target, { recursive: true });
    return { dir: target };
  } catch (e) { return { error: String(e.message || e) }; }
});

// Import a skill from a .zip or .skill archive (extract into the first skills folder).
ipcMain.handle("chai:importSkillZip", async () => {
  const dest = (settings.load().skillsDirs || [])[0];
  if (!dest) return { error: "Add a skills folder first." };
  const r = await dialog.showOpenDialog(win, { properties: ["openFile"], filters: [{ name: "Skill archive", extensions: ["zip", "skill"] }] });
  if (r.canceled) return { canceled: true };
  const src = r.filePaths[0];
  try {
    let zip = src;
    if (!src.toLowerCase().endsWith(".zip")) {
      zip = path.join(os.tmpdir(), "chakra_skill_" + Date.now() + ".zip");
      fs.copyFileSync(src, zip);
    }
    const target = path.join(dest, path.basename(src).replace(/\.(zip|skill)$/i, ""));
    if (process.platform === "win32") {
      execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -Force -LiteralPath '${zip}' -DestinationPath '${target}'`]);
    } else {
      execFileSync("unzip", ["-o", zip, "-d", target]);
    }
    return { dir: target };
  } catch (e) { return { error: String(e.message || e) }; }
});

// ---- IPC: projects + conversations ----
ipcMain.handle("chai:listProjects", () => store.listProjects());
ipcMain.handle("chai:getProject", (_e, id) => store.getProject(id));
ipcMain.handle("chai:createProject", (_e, name) => store.createProject(name));
ipcMain.handle("chai:updateProject", (_e, { id, patch }) => store.updateProject(id, patch));
ipcMain.handle("chai:deleteProject", (_e, id) => store.deleteProject(id));

ipcMain.handle("chai:addKnowledgeText", (_e, { projectId, name, content }) => store.addKnowledge(projectId, { name, type: "text", content }));
ipcMain.handle("chai:addKnowledgeFile", async (_e, projectId) => {
  const r = await dialog.showOpenDialog(win, {
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Text/Docs", extensions: ["txt", "md", "markdown", "json", "csv", "log", "yml", "yaml", "js", "ts", "py", "html", "xml"] }],
  });
  if (r.canceled) return { canceled: true };
  let added = 0;
  for (const fp of r.filePaths) {
    try {
      const content = fs.readFileSync(fp, "utf8");
      store.addKnowledge(projectId, { name: path.basename(fp), type: "file", content });
      added++;
    } catch {}
  }
  return { added, project: store.getProject(projectId) };
});
ipcMain.handle("chai:removeKnowledge", (_e, { projectId, knId }) => store.removeKnowledge(projectId, knId));

ipcMain.handle("chai:listConversations", (_e, projectId) => store.listConversations(projectId));
ipcMain.handle("chai:getConversation", (_e, id) => store.getConversation(id));
ipcMain.handle("chai:createConversation", (_e, projectId) => store.createConversation(projectId));
ipcMain.handle("chai:deleteConversation", (_e, id) => store.deleteConversation(id));

app.on("before-quit", () => { mcp.disconnectAll(); });

app.whenReady().then(createWindow);
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
