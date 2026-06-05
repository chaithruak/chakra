import { useEffect, useState } from "react";
import { Plus, Trash2, Check, RefreshCw, Plug } from "lucide-react";
import { bridge } from "../bridge/index.js";

const BLANK = (id) => ({ id, name: "New provider", kind: "openai", baseUrl: "http://localhost:1234", apiKey: "", model: "" });

export default function Settings({ onChanged }) {
  const [s, setS] = useState(null);
  const [selId, setSelId] = useState(null);
  const [models, setModels] = useState([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    bridge.getSettings().then((cfg) => { setS(cfg); setSelId(cfg.activeProfileId); });
  }, []);

  if (!s || !selId) return <div className="empty"><div>Loading settings…</div></div>;

  const profiles = Object.values(s.profiles);
  const sel = s.profiles[selId];

  const persist = async (next) => { setS(next); await bridge.saveSettings(next); onChanged?.(next); };
  const patch = (field, val) => persist({ ...s, profiles: { ...s.profiles, [selId]: { ...sel, [field]: val } } });
  const makeActive = () => persist({ ...s, activeProfileId: selId });

  const addProfile = () => {
    const id = "p_" + Math.random().toString(36).slice(2, 7);
    persist({ ...s, profiles: { ...s.profiles, [id]: BLANK(id) } });
    setSelId(id);
  };
  const delProfile = () => {
    if (profiles.length <= 1) return;
    const rest = { ...s.profiles }; delete rest[selId];
    const nextActive = s.activeProfileId === selId ? Object.keys(rest)[0] : s.activeProfileId;
    persist({ ...s, profiles: rest, activeProfileId: nextActive });
    setSelId(Object.keys(rest)[0]);
  };

  const test = async () => {
    setStatus("Fetching models…");
    const list = await bridge.listModels(selId);
    setModels(list);
    setStatus(list.length ? `${list.length} models found` : "No /v1/models (enter model id manually)");
  };

  return (
    <div className="settings scroll" style={{ padding: 24, overflow: "auto", display: "grid", gridTemplateColumns: "220px 1fr", gap: 24 }}>
      <div>
        <div className="nav-label" style={{ paddingLeft: 0 }}>Providers</div>
        {profiles.map((p) => (
          <button key={p.id} className={`nav-item ${p.id === selId ? "active" : ""}`} onClick={() => setSelId(p.id)}>
            <Plug size={15} /> {p.name}
            {p.id === s.activeProfileId && <Check size={14} style={{ marginLeft: "auto", color: "var(--accent)" }} />}
          </button>
        ))}
        <button className="nav-item" onClick={addProfile} style={{ marginTop: 6 }}><Plus size={15} /> Add provider</button>
      </div>

      <div style={{ maxWidth: 520 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>{sel.name}</h2>
          {sel.id === s.activeProfileId
            ? <span className="chip" style={{ color: "var(--ok)" }}><Check size={12} /> active</span>
            : <button className="btn" onClick={makeActive}>Set active</button>}
          <span style={{ flex: 1 }} />
          <button className="btn ghost danger" onClick={delProfile}><Trash2 size={14} /></button>
        </div>

        <Field label="Display name">
          <input className="model-search" value={sel.name} onChange={(e) => patch("name", e.target.value)} />
        </Field>
        <Field label="Wire format">
          <select className="model-search" value={sel.kind} onChange={(e) => patch("kind", e.target.value)}>
            <option value="openai">OpenAI-compatible (/v1/chat/completions)</option>
            <option value="anthropic">Anthropic-compatible (/v1/messages)</option>
          </select>
        </Field>
        <Field label="Base URL">
          <input className="model-search" value={sel.baseUrl} onChange={(e) => patch("baseUrl", e.target.value)} placeholder="https://openrouter.ai/api" />
        </Field>
        <Field label="API key">
          <input className="model-search" type="password" value={sel.apiKey} onChange={(e) => patch("apiKey", e.target.value)} placeholder="leave blank for local" />
        </Field>
        <Field label="Current model (or just pick any live model from the top-bar selector)">
          <input className="model-search" value={sel.model} onChange={(e) => patch("model", e.target.value)} placeholder="auto-filled when you pick from the model selector" list="model-list" />
          <datalist id="model-list">{models.map((m) => <option key={m} value={m} />)}</datalist>
        </Field>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
          <button className="btn" onClick={test}><RefreshCw size={14} /> Test connection / load models</button>
          <span style={{ color: "var(--text-2)", fontSize: 12 }}>{status}</span>
        </div>
        <p style={{ color: "var(--text-2)", fontSize: 12, marginTop: 18 }}>
          Saved to disk automatically. The active provider drives every Chat session, and (Phase 2)
          is exported to the agent transport as ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN.
        </p>
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
