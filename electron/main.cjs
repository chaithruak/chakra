const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const settings = require("./settings.cjs");
const { SessionManager } = require("./session-manager.cjs");
const { listModels } = require("./providers.cjs");
const mcp = require("./mcp-manager.cjs");
const skillsMgr = require("./skills-manager.cjs");

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
ipcMain.handle("chai:listSkills", () => skillsMgr.discover(settings.load().skillsDir));
ipcMain.handle("chai:createSkill", (_e, name) => {
  const dir = settings.load().skillsDir;
  if (!dir) return { error: "Set a skills folder first." };
  try { return skillsMgr.createStarter(dir, name); } catch (e) { return { error: String(e.message || e) }; }
});

app.on("before-quit", () => { mcp.disconnectAll(); });

app.whenReady().then(createWindow);
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
