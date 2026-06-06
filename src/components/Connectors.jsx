import { useEffect, useState } from "react";
import { Plus, Trash2, Plug, RefreshCw, Check, Mail, Cloud, HardDrive, Github, MessageSquare, FolderOpen, Globe } from "lucide-react";
import { bridge } from "../bridge/index.js";

const BLANK = (id) => ({ id, name: "New connector", command: "npx", args: [], env: {}, enabled: true });

// App gallery — one click adds the MCP connector; cloud apps still need credentials/sign-in.
const APPS = [
  { name: "Gmail", desc: "Read & search email", icon: Mail, command: "npx", args: ["-y", "@gongrzhe/server-gmail-autoauth-mcp"], env: {} },
  { name: "OneDrive / MS 365", desc: "Files, Outlook, calendar", icon: Cloud, command: "npx", args: ["-y", "@softeria/ms-365-mcp-server"], env: {} },
  { name: "Google Drive", desc: "Search & read Drive", icon: HardDrive, command: "npx", args: ["-y", "@isaacphi/mcp-gdrive"], env: {} },
  { name: "GitHub", desc: "Repos, issues, PRs", icon: Github, command: "npx", args: ["-y", "@modelcontextprotocol/server-github"], env: { GITHUB_PERSONAL_ACCESS_TOKEN: "" } },
  { name: "Slack", desc: "Channels & messages", icon: MessageSquare, command: "npx", args: ["-y", "@modelcontextprotocol/server-slack"], env: { SLACK_BOT_TOKEN: "" } },
  { name: "Filesystem", desc: "Local files in a folder", icon: FolderOpen, command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "<FOLDER>"], env: {} },
  { name: "Web fetch", desc: "Fetch & read web pages", icon: Globe, command: "npx", args: ["-y", "@modelcontextprotocol/server-fetch"], env: {} },
];

export default function Connectors() {
  const [s, setS] = useState(null);
  const [selId, setSelId] = useState(null);
  const [status, setStatus] = useState("");
  const [tools, setTools] = useState(null);

  useEffect(() => {
    bridge.getSettings().then((cfg) => { const withC = { ...cfg, connectors: cfg.connectors || [] }; setS(withC); });
  }, []);

  if (!s) return <div className="empty"><div>Loading…</div></div>;
  const list = s.connectors;
  const sel = list.find((c) => c.id === selId) || null;

  const persist = async (next) => { setS(next); await bridge.saveSettings(next); };
  const setConnectors = (cs) => persist({ ...s, connectors: cs });
  const patch = (field, val) => setConnectors(list.map((c) => (c.id === selId ? { ...c, [field]: val } : c)));

  const addFrom = (app) => {
    const existing = app ? list.find((c) => c.name === app.name) : null;
    if (existing) { setSelId(existing.id); setTools(null); setStatus(""); return; }
    const id = "c_" + Math.random().toString(36).slice(2, 7);
    const c = app ? { ...BLANK(id), name: app.name, command: app.command, args: app.args, env: app.env || {} } : BLANK(id);
    setConnectors([...list, c]); setSelId(id); setTools(null); setStatus("");
  };
  const remove = () => { setConnectors(list.filter((c) => c.id !== selId)); setSelId(null); };

  const test = async () => {
    setStatus("Connecting…"); setTools(null);
    const r = await bridge.testConnector(sel);
    if (r.ok) { setTools(r.tools); setStatus(`Connected — ${r.tools.length} tools`); }
    else setStatus("Failed: " + r.error);
  };

  return (
    <div className="settings scroll" style={{ padding: 24, overflow: "auto" }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>Connect your apps</h2>
      <p style={{ color: "var(--text-2)", fontSize: 13, marginTop: 0 }}>
        One click adds the integration; cloud apps then need a quick sign-in or API key below. Connected apps are
        available to the agent in Chat, Cowork, Code, and Projects.
      </p>

      <div className="app-gallery">
        {APPS.map((a) => {
          const Icon = a.icon;
          const added = list.some((c) => c.name === a.name);
          return (
            <button key={a.name} className={`app-card ${added ? "added" : ""}`} onClick={() => addFrom(a)}>
              <span className="ac-ico"><Icon size={19} /></span>
              <span className="ac-text"><span className="ac-name">{a.name}</span><span className="ac-desc">{a.desc}</span></span>
              <span className="ac-act">{added ? <Check size={15} /> : <Plus size={15} />}</span>
            </button>
          );
        })}
      </div>

      <div className="nav-label" style={{ paddingLeft: 0, marginTop: 18 }}>Your connectors</div>
      <div style={{ display: "grid", gridTemplateColumns: "230px 1fr", gap: 24 }}>
        <div>
          {list.length === 0 && <div style={{ color: "var(--text-2)", fontSize: 13, padding: "6px 2px" }}>None yet — add one above.</div>}
          {list.map((c) => (
            <button key={c.id} className={`nav-item ${c.id === selId ? "active" : ""}`} onClick={() => { setSelId(c.id); setTools(null); setStatus(""); }}>
              <Plug size={15} /> {c.name}
              <span style={{ marginLeft: "auto", width: 7, height: 7, borderRadius: 9, background: c.enabled ? "var(--ok)" : "var(--text-2)" }} />
            </button>
          ))}
          <button className="nav-item" onClick={() => addFrom(null)} style={{ marginTop: 6 }}><Plus size={15} /> Custom MCP server</button>
        </div>

        {!sel ? (
          <div style={{ color: "var(--text-2)", fontSize: 13, paddingTop: 8 }}>Select a connector to configure credentials and test it.</div>
        ) : (
          <div style={{ maxWidth: 560 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>{sel.name}</h3>
              <label className="chip" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={sel.enabled} onChange={(e) => patch("enabled", e.target.checked)} style={{ marginRight: 6 }} /> enabled
              </label>
              <span style={{ flex: 1 }} />
              <button className="btn ghost danger" onClick={remove}><Trash2 size={14} /></button>
            </div>
            <Field label="Display name"><input className="model-search" value={sel.name} onChange={(e) => patch("name", e.target.value)} /></Field>
            <Field label="Command"><input className="model-search" value={sel.command} onChange={(e) => patch("command", e.target.value)} placeholder="npx" /></Field>
            <Field label="Arguments (space-separated)">
              <input className="model-search" value={(sel.args || []).join(" ")} onChange={(e) => patch("args", e.target.value.split(/\s+/).filter(Boolean))} placeholder="-y @modelcontextprotocol/server-filesystem C:\\path" />
            </Field>
            <Field label="Environment / tokens (KEY=VALUE per line)">
              <textarea className="model-search" rows={3} style={{ fontFamily: "var(--mono)", resize: "vertical" }}
                value={Object.entries(sel.env || {}).map(([k, v]) => `${k}=${v}`).join("\n")}
                onChange={(e) => { const env = {}; e.target.value.split("\n").forEach((l) => { const i = l.indexOf("="); if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }); patch("env", env); }}
                placeholder="GITHUB_PERSONAL_ACCESS_TOKEN=ghp_..." />
            </Field>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
              <button className="btn" onClick={test}><RefreshCw size={14} /> Test connection</button>
              <span style={{ color: status.startsWith("Failed") ? "var(--danger)" : "var(--text-2)", fontSize: 12 }}>{status}</span>
            </div>
            {tools && (
              <div style={{ marginTop: 12 }}>
                <div style={{ color: "var(--text-2)", fontSize: 12, marginBottom: 6 }}>Available tools</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{tools.map((t) => <span key={t} className="badge" style={{ fontFamily: "var(--mono)" }}>{t}</span>)}</div>
              </div>
            )}
          </div>
        )}
      </div>
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
