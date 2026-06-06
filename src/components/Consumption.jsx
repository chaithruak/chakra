import { useEffect, useState } from "react";
import { bridge } from "../bridge/index.js";

const RANGES = [{ label: "7d", days: 7 }, { label: "30d", days: 30 }, { label: "All", days: 0 }];
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(n || 0));

export default function Consumption() {
  const [days, setDays] = useState(7);
  const [d, setD] = useState(null);
  useEffect(() => { bridge.getUsage(days).then(setD); }, [days]);
  if (!d) return <div className="empty"><div>Loading…</div></div>;

  const maxTok = Math.max(1, ...d.models.map((m) => m.tokens));
  const cards = [
    ["Messages", d.messages],
    ["Total tokens (est.)", fmt(d.tokens)],
    ["Sessions", d.sessions],
    ["Active days", d.activeDays],
    ["Current streak", d.currentStreak + "d"],
    ["Longest streak", d.longestStreak + "d"],
    ["Peak hour", d.peakHour],
    ["Top model", d.favoriteModel],
  ];

  return (
    <div className="settings scroll" style={{ padding: 24, overflow: "auto", maxWidth: 920 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Consumption</h2>
        <span style={{ flex: 1 }} />
        <div className="seg">
          {RANGES.map((r) => (
            <button key={r.label} className={`seg-btn ${days === r.days ? "active" : ""}`} onClick={() => setDays(r.days)}>{r.label}</button>
          ))}
        </div>
      </div>

      <div className="usage-cards">
        {cards.map(([k, v]) => (
          <div className="ucard" key={k}><div className="ucard-k">{k}</div><div className="ucard-v">{v}</div></div>
        ))}
      </div>

      <div className="nav-label" style={{ paddingLeft: 0, marginTop: 22 }}>Tokens by model</div>
      {d.models.length === 0 ? (
        <div style={{ color: "var(--text-2)", fontSize: 13, padding: "10px 0" }}>No usage yet — send a few messages and come back.</div>
      ) : (
        <div className="bars">
          {d.models.map((m) => (
            <div className="bar-row" key={m.model}>
              <div className="bar-label" title={m.model}>{m.model}</div>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(3, (m.tokens / maxTok) * 100)}%` }} /></div>
              <div className="bar-val">{fmt(m.tokens)} · {m.messages} msg</div>
            </div>
          ))}
        </div>
      )}
      <p style={{ color: "var(--text-2)", fontSize: 12, marginTop: 18 }}>
        Tokens are estimated from text length (~4 chars/token) since not every provider reports exact usage.
      </p>
    </div>
  );
}
