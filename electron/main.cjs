const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");
const crypto = require("crypto");
const { execFileSync, execFile } = require("child_process");
const pExecFile = require("util").promisify(execFile);

const b64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const settings = require("./settings.cjs");
const { SessionManager } = require("./session-manager.cjs");
const { listModels, ping } = require("./providers.cjs");
const mcp = require("./mcp-manager.cjs");
const skillsMgr = require("./skills-manager.cjs");
const store = require("./projects-store.cjs");
const dispatch = require("./dispatch-store.cjs");
const runner = require("./dispatch-runner.cjs");
const usage = require("./usage-store.cjs");
const tgbot = require("./telegram-bot.cjs");

function reconcileMessaging() {
  const m = settings.load().messaging || {};
  if (m.enabled && m.platform === "telegram" && m.telegramToken) {
    tgbot.start({ token: m.telegramToken, allowed: m.telegramAllowedUserIds, target: m.target, folder: m.folder });
  } else {
    tgbot.stop();
  }
}

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
ipcMain.handle("chai:pingProvider", async (_e, profileId) => {
  const s = settings.load();
  const p = profileId ? s.profiles[profileId] : settings.activeProfile(s);
  try { return await ping(p); } catch { return false; }
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

// Link a project to a source folder or a GitHub repo (gives its conversations file access).
ipcMain.handle("chai:linkProjectFolder", async (_e, projectId) => {
  const r = await dialog.showOpenDialog(win, { properties: ["openDirectory"], title: "Link a folder to this project" });
  if (r.canceled) return { canceled: true };
  store.updateProject(projectId, { folder: r.filePaths[0], githubUrl: "" });
  return { folder: r.filePaths[0] };
});
ipcMain.handle("chai:linkGithub", async (_e, { projectId, url }) => {
  if (!url) return { error: "Enter a repository URL." };
  const repoName = (url.split("/").pop() || "repo").replace(/\.git$/, "");
  const dest = path.join(app.getPath("userData"), "projects-data", "repos", projectId);
  const target = path.join(dest, repoName);
  try {
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    await pExecFile("git", ["clone", "--depth", "1", url, target], { timeout: 180000 });
    store.updateProject(projectId, { folder: target, githubUrl: url });
    return { folder: target };
  } catch (e) { return { error: String((e && e.message) || e).slice(0, 400) }; }
});
ipcMain.handle("chai:pullGithub", async (_e, projectId) => {
  const p = store.getProject(projectId);
  if (!p || !p.folder) return { error: "No linked repo." };
  try { await pExecFile("git", ["-C", p.folder, "pull"], { timeout: 180000 }); return { ok: true }; }
  catch (e) { return { error: String((e && e.message) || e).slice(0, 400) }; }
});
ipcMain.handle("chai:unlinkProjectSource", (_e, projectId) => store.updateProject(projectId, { folder: "", githubUrl: "" }));

ipcMain.handle("chai:listConversations", (_e, projectId) => store.listConversations(projectId));
ipcMain.handle("chai:getConversation", (_e, id) => store.getConversation(id));
ipcMain.handle("chai:createConversation", (_e, projectId) => store.createConversation(projectId));
ipcMain.handle("chai:deleteConversation", (_e, id) => store.deleteConversation(id));

// ---- IPC: dispatch (background + scheduled tasks) ----
ipcMain.handle("chai:listTasks", () => dispatch.listTasks());
ipcMain.handle("chai:createTask", () => dispatch.createTask());
ipcMain.handle("chai:updateTask", (_e, { id, patch }) => dispatch.updateTask(id, patch));
ipcMain.handle("chai:deleteTask", (_e, id) => dispatch.deleteTask(id));
ipcMain.handle("chai:getRuns", (_e, id) => dispatch.getRuns(id));
ipcMain.handle("chai:getUsage", (_e, days) => usage.summary(days));

// ---- IPC: messaging (Telegram) ----
ipcMain.handle("chai:applyMessaging", () => { reconcileMessaging(); return tgbot.getStatus(); });
ipcMain.handle("chai:messagingStatus", () => tgbot.getStatus());
ipcMain.handle("chai:runTaskNow", async (_e, id) => {
  const t = dispatch.getTask(id);
  if (!t) return { status: "error", output: "Task not found." };
  const run = await runner.runTask(t);
  dispatch.addRun(id, run);
  return run;
});

// Scheduler — checks every minute whether any task is due.
function isDue(task, now) {
  const sc = task.schedule || {};
  if (!sc.mode || sc.mode === "off") return false;
  const since = now - (task.lastRun || 0);
  if (sc.mode === "interval") return since >= (sc.everyMinutes || 60) * 60000;
  const d = new Date(now);
  const hhmm = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  if (sc.mode === "daily") return hhmm === (sc.time || "09:00") && since > 23 * 3600 * 1000;
  if (sc.mode === "weekly") return d.getDay() === (sc.weekday ?? 1) && hhmm === (sc.time || "09:00") && since > 6 * 24 * 3600 * 1000;
  return false;
}
async function schedulerTick() {
  const now = Date.now();
  for (const t of dispatch.listTasks()) {
    if (!isDue(t, now)) continue;
    try {
      const run = await runner.runTask(t);
      dispatch.addRun(t.id, run);
      if (win && !win.isDestroyed()) win.webContents.send("chai:dispatchRun", { taskId: t.id, run });
    } catch {}
  }
}
setInterval(schedulerTick, 60000);

// ---- IPC: account / sign-in ----
ipcMain.handle("chai:saveAccount", (_e, account) => {
  const cfg = settings.load();
  settings.save({ ...cfg, account: { ...(cfg.account || {}), ...account } });
  return settings.load().account;
});
ipcMain.handle("chai:signOut", () => {
  const cfg = settings.load();
  settings.save({ ...cfg, account: { name: "", email: "", avatar: "", googleLinked: false, anthropicLinked: false } });
  return true;
});
ipcMain.handle("chai:linkAnthropic", () => {
  const cfg = settings.load();
  settings.save({ ...cfg, account: { ...(cfg.account || {}), anthropicLinked: true } });
  return { ok: true, note: "Run `claude login` once in a terminal to authorize your Anthropic account; the agent (SDK) path will then bill usage to your account instead of an API key." };
});
ipcMain.handle("chai:googleSignIn", async () => {
  const cfg = settings.load();
  const clientId = cfg.googleClientId;
  if (!clientId) return { error: "Add a Google OAuth Client ID (Account settings) first. Create one at console.cloud.google.com → Credentials → OAuth client → Desktop app." };
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  return await new Promise((resolve) => {
    let redirectUri = "";
    let done = false;
    const finish = (r) => { if (done) return; done = true; try { server.close(); } catch {} resolve(r); };
    const server = http.createServer(async (req, res) => {
      try {
        const u = new URL(req.url, "http://127.0.0.1");
        const code = u.searchParams.get("code");
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body style='font-family:system-ui;background:#0b0d12;color:#eef;display:grid;place-items:center;height:100vh'><h2>Chai — signed in. You can close this window.</h2></body></html>");
        if (!code) return finish({ error: "No authorization code returned." });
        const body = new URLSearchParams({ code, client_id: clientId, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: verifier });
        if (cfg.googleClientSecret) body.set("client_secret", cfg.googleClientSecret);
        const tk = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
        const tj = await tk.json();
        if (!tj.access_token) return finish({ error: "Token exchange failed: " + JSON.stringify(tj).slice(0, 220) });
        const info = await (await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: "Bearer " + tj.access_token } })).json();
        const account = { name: info.name || "", email: info.email || "", avatar: info.picture || "", googleLinked: true, anthropicLinked: (cfg.account || {}).anthropicLinked || false };
        settings.save({ ...settings.load(), account });
        finish({ account });
      } catch (e) { finish({ error: String((e && e.message) || e) }); }
    });
    server.listen(0, "127.0.0.1", () => {
      redirectUri = `http://127.0.0.1:${server.address().port}`;
      const authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
        client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: "openid email profile",
        code_challenge: challenge, code_challenge_method: "S256", access_type: "offline", prompt: "consent",
      }).toString();
      shell.openExternal(authUrl);
    });
    setTimeout(() => finish({ error: "Sign-in timed out." }), 180000);
  });
});

// GitHub sign-in via device flow (no secret needed; enable Device Flow on your OAuth app).
ipcMain.handle("chai:githubSignIn", async () => {
  const cfg = settings.load();
  const clientId = cfg.githubClientId;
  if (!clientId) return { error: "Add a GitHub OAuth Client ID in Profile first (github.com → Settings → Developer settings → OAuth Apps → enable Device Flow)." };
  try {
    const dc = await (await fetch("https://github.com/login/device/code", {
      method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, scope: "read:user user:email" }),
    })).json();
    if (!dc.device_code) return { error: "GitHub device code failed: " + JSON.stringify(dc).slice(0, 200) };
    shell.openExternal(dc.verification_uri);
    dialog.showMessageBox(win, { type: "info", title: "GitHub sign-in", message: `Enter this code on GitHub:\n\n${dc.user_code}`, detail: dc.verification_uri });
    const deadline = Date.now() + (dc.expires_in || 900) * 1000;
    let interval = (dc.interval || 5) * 1000;
    while (Date.now() < deadline) {
      await sleep(interval);
      const tk = await (await fetch("https://github.com/login/oauth/access_token", {
        method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, device_code: dc.device_code, grant_type: "urn:ietf:params:oauth:grant-type:device_code" }),
      })).json();
      if (tk.access_token) {
        const u = await (await fetch("https://api.github.com/user", { headers: { Authorization: "Bearer " + tk.access_token, "User-Agent": "Chai", Accept: "application/vnd.github+json" } })).json();
        const account = { ...(cfg.account || {}), name: u.name || u.login || "", email: u.email || "", avatar: u.avatar_url || "", githubLinked: true };
        settings.save({ ...settings.load(), account });
        return { account };
      }
      if (tk.error === "slow_down") interval += 5000;
      else if (tk.error && tk.error !== "authorization_pending") return { error: tk.error };
    }
    return { error: "Sign-in timed out." };
  } catch (e) { return { error: String((e && e.message) || e) }; }
});

app.on("before-quit", () => { mcp.disconnectAll(); });

app.whenReady().then(() => { createWindow(); reconcileMessaging(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
