import ModelPicker from "./ModelPicker.jsx";
import TeaLogo from "./TeaLogo.jsx";
import { PermissionPicker } from "./Topbar.jsx";
import { MODES } from "../bridge/contract.js";

const ORDER = ["chat", "cowork", "code", "project"];

export default function TopNav({ mode, onSelect, model, groups, onModel, onRefresh, permissionMode, onPermissionChange, online, loc }) {
  const tabs = ORDER.map((id) => MODES.find((m) => m.id === id)).filter(Boolean);
  const agent = mode === "cowork" || mode === "code";
  const dot = online === null ? "var(--text-2)" : online ? "var(--ok)" : "var(--danger)";
  const dotLabel = online === null ? "checking…" : online ? "online" : "offline";

  return (
    <header className="topnav glass">
      <div className="tn-brand">
        <div className="mark tea"><TeaLogo size={24} /></div>
        <span className="tn-name">Chai</span>
      </div>

      <nav className="tn-tabs">
        {tabs.map((m) => (
          <button key={m.id} className={`tn-tab ${mode === m.id ? "active" : ""}`} onClick={() => onSelect(m.id)}>{m.label}</button>
        ))}
      </nav>

      <div className="tn-right">
        <span className="chip" title={`Active model is ${dotLabel}`} style={{ gap: 7 }}>
          <span style={{ width: 7, height: 7, borderRadius: 9, background: dot, boxShadow: online ? "0 0 7px var(--ok)" : "none" }} />
          {loc || dotLabel}
        </span>
      </div>
    </header>
  );
}
