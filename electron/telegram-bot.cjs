// Telegram bot — drives Chai's agent remotely via the Bot API (long polling, no server).
// Reuses the dispatch runner so it inherits providers/skills/connectors. Single poll loop
// that reads the latest config each iteration, so re-applying settings reconfigures it live.
const runner = require("./dispatch-runner.cjs");

let cfg = null, active = false, running = false, offset = 0;
let status = "stopped", username = "";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tg(token, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}),
  });
  return res.json();
}
async function send(token, chatId, text) {
  const s = String(text || "(no output)");
  for (let i = 0; i < s.length; i += 3800) {
    try { await tg(token, "sendMessage", { chat_id: chatId, text: s.slice(i, i + 3800) }); } catch {}
  }
}

async function handle(c, u) {
  const msg = u.message;
  if (!msg || !msg.text) return;
  const from = String(msg.from && msg.from.id);
  const allowed = (c.allowed || "").split(/[,\s]+/).filter(Boolean);
  if (!allowed.length) { await send(c.token, msg.chat.id, "🔒 Chai bot is locked — no allowed user is configured in Settings → Messaging."); return; }
  if (!allowed.includes(from)) { await send(c.token, msg.chat.id, `Not authorized. Your Telegram user id is ${from}.`); return; }

  const text = msg.text.trim();
  if (text === "/start" || text === "/help") { await send(c.token, msg.chat.id, "Chai is connected ☕. Send a prompt and I'll run it. Target: " + (c.target || "chat") + "."); return; }

  try { await tg(c.token, "sendChatAction", { chat_id: msg.chat.id, action: "typing" }); } catch {}
  const target = c.target === "folder" && c.folder ? { type: "folder", folder: c.folder } : { type: "chat" };
  let run;
  try { run = await runner.runTask({ prompt: text, target }); }
  catch (e) { run = { output: "Error: " + ((e && e.message) || e) }; }
  await send(c.token, msg.chat.id, run.output);
}

async function loop() {
  running = true;
  while (active) {
    const c = cfg;
    if (!c || !c.token) { status = "no token"; await sleep(1200); continue; }
    let upd;
    try { upd = await tg(c.token, "getUpdates", { offset, timeout: 25 }); }
    catch { status = "network error"; await sleep(2000); continue; }
    if (!upd || !upd.ok) {
      const code = upd && upd.error_code;
      const desc = (upd && upd.description) || "no response";
      if (code === 401) status = "bad token";
      else if (code === 404) status = "bad token (404)";
      else if (code === 409) { status = "conflict — clearing webhook…"; try { await tg(c.token, "deleteWebhook", { drop_pending_updates: false }); } catch {} }
      else status = "error: " + desc;
      await sleep(3000); continue;
    }
    status = username ? `online @${username}` : "online";
    for (const u of upd.result) { offset = u.update_id + 1; await handle(c, u); }
  }
  running = false; status = "stopped";
}

async function start(c) {
  cfg = c; active = true;
  try { const me = await tg(c.token, "getMe"); if (me && me.ok) username = me.result.username; } catch {}
  if (!running) loop().catch(() => { running = false; status = "error"; });
}
function stop() { active = false; }
function getStatus() { return { running, status, username }; }

module.exports = { start, stop, getStatus };
