import { useEffect, useState } from "react";
import { Plus, Trash2, Plug, RefreshCw, Check, X } from "lucide-react";
import { bridge } from "../bridge/index.js";

const BLANK = (id) => ({ id, name: "New connector", command: "npx", args: [], env: {}, enabled: true });

// A couple of ready-to-use examples to lower the barrier.
const PRESETS = [
  { name: "Filesystem", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "<FOLDER>"] },
  { name: "Fetch (web)", command: "npx", args: ["-y", "@modelcontextprotocol/server-fetch"] },
];

export default function Connectors() {
  const [s, setS] = useState(null);
  const [selId, setSelId] = useState(null);
  const [status, setStatus] = useState("");
  const [tools, setTools] = useState(null);

  useEffect(() => {
    bridge.getSettings().then((cfg) => {
      const withC = { ...cfg, connectors: cfg.connectors || [] };
      setS(withC);
      setSelId(withC.connectors[0]?.id || null);
    });
  }, []);

  if (!s) return <div className="empty"><div>Loading…</div></div>;
  const list = s.connectors;
  const sel = list.find((c) => c.id === selId) || null;

  const persist = async (next) => { setS(next); await bridge.saveSettings(next); };
  const setConnectors = (cs) => persist({ ...s, connectors: cs });
  const patch = (field, val) => setConnectors(list.map((c) => (c.id === selId ? { ...c, [field]: val } : c)));

  const add = (preset) => {
    const id = "c_" + Math.random().toString(36).slice(2, 7);
    const c = preset ? { ...BLANK(id), name: preset.name, command: preset.command, args: preset.args } : BLANK(id);
    setConnectors([...list, c]); setSelId(id); setTools(null); setStatus("");
  };
  const remove = () => { setConnectors(list.filter((c) => c.id !== selId)); setSelId(null); };

  const test = async () => {
    setStatus("Connecting…"); setTools(null);
    const r = await bridge.testConnector(sel);
    if (r.ok) { setTools(r.tools); setStatus(`Connected — ${r.tools.length} tools`); }
    else { setStatus("Failed: " + r.error); }
  };

  return (
    <div className="settings scroll" style={{ padding: 24, overflow: "auto", display: "grid", gridTemplateColumns: "240px 1fr", gap: 24 }}>
      <div>
        <div className="nav-label" style={{ paddingLeft: 0 }}>Connectors (MCP)</div>
        {list.map((c) => (
          <button key={c.id} className={`nav-item ${c.id === selId ? "active" : ""}`} onClick={() => { setSelId(c.id); setTools(null); setStatus(""); }}>
            <Plug size={15} /> {c.name}
            <span style={{ marginLeft: "auto", width: 7, height: 7, borderRadius: 9, background: c.enabled ? "var(--ok)" : "var(--text-2)" }} />
          </button>
        ))}
        <button className="nav-item" onClick={() => add(null)} style={{ marginTop: 6 }}><Plus size={15} /> Add connector</button>
        <div className="nav-label" style={{ paddingLeft: 0, marginTop: 14 }}>Quick add</div>
        {PRESETS.map((p) => (
          <button key={p.name} className="nav-item" onClick={() => add(p)}><Plus size={14} /> {p.name}</button>
        ))}
      </div>

      {!sel ? (
        <div className="empty"><div><div className="big">Connectors</div><div>Add an MCP server to give the agent external tools. Pick a Quick add to start.</div></div></div>
      ) : (
        <div style={{ maxWidth: 560 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 17 }}>{sel.name}</h2>
            <label className="chip" style={{ cursor: "pointer" }}>
              <input type="checkbox" checked={sel.enabled} onChange={(e) => patch("enabled", e.target.checked)} style={{ marginRight: 6 }} />
              enabled
            </label>
            <span style={{ flex: 1 }} />
            <button className="btn ghost danger" onClick={remove}><Trash2 size={14} /></button>
          </div>

          <Field label="Display name">
            <input className="model-search" value={sel.name} onChange={(e) => patch("name", e.target.value)} />
          </Field>
          <Field label="Command">
            <input className="model-search" value={sel.command} onChange={(e) => patch("command", e.target.value)} placeholder="npx" />
          </Field>
          <Field label="Arguments (space-separated)">
            <input className="model-search" value={(sel.args || []).join(" ")}
              onChange={(e) => patch("args", e.target.value.split(/\s+/).filter(Boolean))}
              placeholder="-y @modelcontextprotocol/server-filesystem C:\\path\\to\\folder" />
          </Field>
          <Field label="Environment (KEY=VALUE per line, optional)">
            <textarea className="model-search" rows={3} style={{ fontFamily: "var(--mono)", resize: "vertical" }}
              value={Object.entries(sel.env || {}).map(([k, v]) => `${k}=${v}`).join("\n")}
              onChange={(e) => {
                const env = {};
                e.target.value.split("\n").forEach((l) => { const i = l.indexOf("="); if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
                patch("env", env);
              }}
              placeholder="GITHUB_TOKEN=ghp_..." />
          </Field>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
            <button className="btn" onClick={test}><RefreshCw size={14} /> Test connection</button>
            <span style={{ color: status.startsWith("Failed") ? "var(--danger)" : "var(--text-2)", fontSize: 12 }}>{status}</span>
          </div>
          {tools && (
            <div style={{ marginTop: 12 }}>
              <div style={{ color: "var(--text-2)", fontSize: 12, marginBottom: 6 }}>Discovered tools</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {tools.map((t) => <span key={t} className="badge" style={{ fontFamily: "var(--mono)" }}>{t}</span>)}
              </div>
            </div>
          )}
          <p style={{ color: "var(--text-2)", fontSize: 12, marginTop: 18 }}>
            Enabled connectors are offered to the agent in Cowork/Code. Tool calls from connectors always
            ask for approval (unless permission mode is "Act"). Requires Node — MCP servers are spawned via your command.
          </p>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 5 }}>{label}</div>
      {children}
    </label>
  );
}
