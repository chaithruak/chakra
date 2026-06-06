// Usage tracking — appends one event per assistant turn, aggregates for the Consumption view.
// Tokens are ESTIMATED from characters (~4 chars/token) since not all providers return usage.
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const file = () => path.join(app.getPath("userData"), "usage.jsonl");

function append(ev) { try { fs.appendFileSync(file(), JSON.stringify(ev) + "\n"); } catch {} }
function readAll() {
  try {
    return fs.readFileSync(file(), "utf8").trim().split("\n").filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

const addDays = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function streaks(daySet) {
  const days = [...daySet].sort();
  if (!days.length) return { current: 0, longest: 0 };
  let longest = 0;
  for (const d of days) {
    if (!daySet.has(addDays(d, -1))) { let len = 1, cur = d; while (daySet.has(addDays(cur, 1))) { len++; cur = addDays(cur, 1); } longest = Math.max(longest, len); }
  }
  const today = new Date().toISOString().slice(0, 10);
  let cur = 0, d = daySet.has(today) ? today : (daySet.has(addDays(today, -1)) ? addDays(today, -1) : null);
  while (d && daySet.has(d)) { cur++; d = addDays(d, -1); }
  return { current: cur, longest };
}
const fmtHour = (h) => `${(h % 12) || 12} ${h < 12 ? "AM" : "PM"}`;

function summary(days) {
  const since = days ? Date.now() - days * 86400000 : 0;
  const evs = readAll().filter((e) => (e.at || 0) >= since);
  let tokens = 0;
  const byModel = {}, byDay = {}, byHour = {}, daySet = new Set(), sessSet = new Set();
  for (const e of evs) {
    const tk = Math.round(((e.promptChars || 0) + (e.replyChars || 0)) / 4);
    tokens += tk;
    const m = e.model || "unknown";
    byModel[m] = byModel[m] || { messages: 0, tokens: 0 };
    byModel[m].messages++; byModel[m].tokens += tk;
    const dk = new Date(e.at).toISOString().slice(0, 10);
    byDay[dk] = (byDay[dk] || 0) + tk; daySet.add(dk);
    const hr = new Date(e.at).getHours(); byHour[hr] = (byHour[hr] || 0) + 1;
    if (e.sessionId) sessSet.add(e.sessionId);
  }
  const models = Object.entries(byModel).map(([model, v]) => ({ model, ...v })).sort((a, b) => b.tokens - a.tokens);
  const peakEntry = Object.entries(byHour).sort((a, b) => b[1] - a[1])[0];
  const { current, longest } = streaks(daySet);
  return {
    messages: evs.length,
    tokens,
    models,
    favoriteModel: models[0] ? models[0].model : "—",
    peakHour: peakEntry ? fmtHour(Number(peakEntry[0])) : "—",
    activeDays: daySet.size,
    sessions: sessSet.size,
    currentStreak: current,
    longestStreak: longest,
    byDay,
  };
}

module.exports = { append, summary };
