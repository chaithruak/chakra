import { useEffect, useState } from "react";
import { Plus, Trash2, Check, RefreshCw, Plug, User, ShieldCheck, Cpu, LogOut } from "lucide-react";
import { bridge } from "../bridge/index.js";

const BLANK = (id) => ({ id, name: "New provider", kind: "openai", baseUrl: "http://localhost:1234", apiKey: "", model: "" });
const SECTIONS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "account", label: "Account & sign-in", icon: ShieldCheck },
  { id: "model", label: "Model configuration", icon: Cpu },
];

export default function Settings({ onChanged }) {
  const [s, setS] = useState(null);
  const [selId, setSelId] = useState(null);
  const [models, setModels] = useState([]);
  const [status, setStatus] = useState("");
  const [section, setSection] = useState("profile");
  const [busy, setBusy] = useState("");

  useEffect(() => { bridge.getSettings().then((cfg) => { setS(cfg); setSelId(cfg.activeProfileId); }); }, []);
  if (!s || !selId) return <div className="empty"><div>Loading settings…</div></div>;

  const account = s.account || {};
  const profiles = Object.values(s.profiles);
  const sel = s.profiles[selId];

  const persist = async (next) => { setS(next); await bridge.saveSettings(next); onChanged?.(next); };
  const patch = (field, val) => persist({ ...s, profiles: { ...s.profiles, [selId]: { ...sel, [field]: val } } });
  const setAccount = (a) => persist({ ...s, account: { ...account, ...a } });
  const setField = (k, v) => persist({ ...s, [k]: v });

  const addProfile = () => { const id = "p_" + Math.random().toString(36).slice(2, 7); persist({ ...s, profiles: { ...s.profiles, [id]: BLANK(id) } }); setSelId(id); };
  const delProfile = () => {
    if (profiles.length <= 1) return;
    const rest = { ...s.profiles }; delete rest[selId];
    persist({ ...s, profiles: rest, activeProfileId: s.activeProfileId === selId ? Object.keys(rest)[0] : s.activeProfileId });
    setSelId(Object.keys(rest)[0]);
  };
  const test = async () => { setStatus("Fetching models…"); const list = await bridge.listModels(selId); setModels(list); setStatus(list.length ? `${list.length} models found` : "No /v1/models — enter the model id manually"); };

  const googleSignIn = async () => {
    setBusy("google");
    const r = await bridge.googleSignIn();
    setBusy("");
    if (r?.error) { setStatus(r.error); return; }
    if (r?.account) { const next = await bridge.getSettings(); setS(next); }
  };
  const linkAnthropic = async () => { const r = await bridge.linkAnthropic(); setAccount({ anthropicLinked: true }); if (r?.note) setStatus(r.note); };
  const signOut = async () => { await bridge.signOut(); const next = await bridge.getSettings(); setS(next); };

  const initials = (account.name || account.email || "Y").slice(0, 1).toUpperCase();

  return (
    <div className="settings scroll" style={{ padding: 0, overflow: "hidden", display: "grid", gridTemplateColumns: "230px 1fr", height: "100%" }}>
      <div style={{ borderRight: "1px solid var(--line)", padding: 16, overflowY: "auto" }}>
        <div className="nav-label" style={{ paddingLeft: 0 }}>Settings</div>
        {SECTIONS.map((sec) => { const I = sec.icon; return (
          <button key={sec.id} className={`nav-item ${section === sec.id ? "active" : ""}`} onClick={() => setSection(sec.id)}><I size={15} /> {sec.label}</button>
        ); })}
      </div>

      <div style={{ padding: 24, overflowY: "auto" }}>
        {section === "profile" && (
          <div style={{ maxWidth: 480 }}>
            <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>Profile</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
              {account.avatar ? <img src={account.avatar} alt="" style={{ width: 56, height: 56, borderRadius: "50%" }} />
                : <div style={{ width: 56, height: 56, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 22, fontWeight: 600, background: "linear-gradient(135deg, var(--accent), var(--accent-2))", color: "#06070a" }}>{initials}</div>}
              <div>
                <div style={{ fontWeight: 600, fontSize: 16 }}>{account.name || "Your name"}</div>
                <div style={{ color: "var(--text-2)", fontSize: 13 }}>{account.email || "no email set"}</div>
              </div>
            </div>
            <Field label="Display name"><input className="model-search" value={account.name || ""} onChange={(e) => setAccount({ name: e.target.value })} placeholder="Your name" /></Field>
            <Field label="Email"><input className="model-search" value={account.email || ""} onChange={(e) => setAccount({ email: e.target.value })} placeholder="you@example.com" /></Field>
            <Field label="Avatar URL (optional)"><input className="model-search" value={account.avatar || ""} onChange={(e) => setAccount({ avatar: e.target.value })} placeholder="https://…" /></Field>
          </div>
        )}

        {section === "account" && (
          <div style={{ maxWidth: 520 }}>
            <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>Account & sign-in</h2>

            <div className="acc-card">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <strong>Google</strong>
                {account.googleLinked && <span className="chip" style={{ color: "var(--ok)" }}><Check size={12} /> connected</span>}
                <span style={{ flex: 1 }} />
                <button className="btn primary" onClick={googleSignIn} disabled={busy === "google"}>{busy === "google" ? "Opening…" : account.googleLinked ? "Re-sign in" : "Sign in with Google"}</button>
              </div>
              <p style={{ color: "var(--text-2)", fontSize: 12, margin: "8px 0 10px" }}>
                Uses your own Google OAuth client (PKCE). Create one at console.cloud.google.com → Credentials → OAuth client → <b>Desktop app</b>, then paste the ID below.
              </p>
              <Field label="Google OAuth Client ID"><input className="model-search" value={s.googleClientId || ""} onChange={(e) => setField("googleClientId", e.target.value)} placeholder="…apps.googleusercontent.com" /></Field>
              <Field label="Google Client Secret (if your client type requires it)"><input className="model-search" type="password" value={s.googleClientSecret || ""} onChange={(e) => setField("googleClientSecret", e.target.value)} /></Field>
            </div>

            <div className="acc-card">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <strong>Anthropic account</strong>
                {account.anthropicLinked && <span className="chip" style={{ color: "var(--ok)" }}><Check size={12} /> linked</span>}
                <span style={{ flex: 1 }} />
                <button className="btn" onClick={linkAnthropic}>Link Anthropic account</button>
              </div>
              <p style={{ color: "var(--text-2)", fontSize: 12, margin: "8px 0 0" }}>
                Bills usage to your Anthropic subscription instead of an API key. After linking, run <code>claude login</code> once in a terminal to authorize; the agent (Anthropic) path then uses your account automatically.
              </p>
            </div>

            {(account.googleLinked || account.name || account.email) && (
              <button className="btn ghost danger" onClick={signOut} style={{ marginTop: 14 }}><LogOut size={14} /> Sign out / clear profile</button>
            )}
            {status && <div style={{ color: "var(--text-2)", fontSize: 12, marginTop: 12 }}>{status}</div>}
          </div>
        )}

        {section === "model" && (
          <div style={{ display: "grid", gridTemplateColumns: "210px 1fr", gap: 24 }}>
            <div>
              <div className="nav-label" style={{ paddingLeft: 0 }}>Providers</div>
              {profiles.map((p) => (
                <button key={p.id} className={`nav-item ${p.id === selId ? "active" : ""}`} onClick={() => setSelId(p.id)}>
                  <Plug size={15} /> {p.name}
                </button>
              ))}
              <button className="nav-item" onClick={addProfile} style={{ marginTop: 6 }}><Plus size={15} /> Add provider</button>
            </div>
            <div style={{ maxWidth: 520 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>{sel.name}</h3>
                <span style={{ flex: 1 }} />
                <button className="btn ghost danger" onClick={delProfile}><Trash2 size={14} /></button>
              </div>
              <Field label="Display name"><input className="model-search" value={sel.name} onChange={(e) => patch("name", e.target.value)} /></Field>
              <Field label="Wire format">
                <select className="model-search" value={sel.kind} onChange={(e) => patch("kind", e.target.value)}>
                  <option value="openai">OpenAI-compatible (/v1/chat/completions)</option>
                  <option value="anthropic">Anthropic-compatible (/v1/messages)</option>
                </select>
              </Field>
              <Field label="Base URL"><input className="model-search" value={sel.baseUrl} onChange={(e) => patch("baseUrl", e.target.value)} placeholder="https://openrouter.ai/api" /></Field>
              <Field label="API key"><input className="model-search" type="password" value={sel.apiKey} onChange={(e) => patch("apiKey", e.target.value)} placeholder="leave blank for local" /></Field>
              <Field label="Current model (pick any live model from the top-bar selector)">
                <input className="model-search" value={sel.model} onChange={(e) => patch("model", e.target.value)} list="model-list" />
                <datalist id="model-list">{models.map((m) => <option key={m} value={m} />)}</datalist>
              </Field>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                <button className="btn" onClick={test}><RefreshCw size={14} /> Test connection / load models</button>
                <span style={{ color: "var(--text-2)", fontSize: 12 }}>{status}</span>
              </div>
              <p style={{ color: "var(--text-2)", fontSize: 12, marginTop: 18 }}>
                Every provider is always available — the model you pick in the top-bar selector decides which one runs. No need to mark one "active".
              </p>
            </div>
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
