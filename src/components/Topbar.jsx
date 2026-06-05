import { useState, useRef, useEffect } from "react";
import { ShieldCheck, ShieldOff, Eye, Zap, ChevronDown, Check } from "lucide-react";
import ModelPicker from "./ModelPicker.jsx";
import { MODES } from "../bridge/contract.js";

const PERMS = [
  { id: "default", label: "Ask before changes", desc: "Approve each edit or command", icon: ShieldCheck },
  { id: "acceptEdits", label: "Auto-accept edits", desc: "Apply file edits, ask for commands", icon: Zap },
  { id: "bypassPermissions", label: "Act — trust all", desc: "Run everything without asking", icon: ShieldOff },
  { id: "plan", label: "Read-only", desc: "Inspect only, never modify", icon: Eye },
];

function PermissionPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const cur = PERMS.find((p) => p.id === value) || PERMS[0];
  const Icon = cur.icon;
  return (
    <div className="model-picker" ref={ref}>
      <button className="model-btn" onClick={() => setOpen((o) => !o)} title="Permission mode">
        <Icon size={13} /> {cur.label} <ChevronDown size={14} />
      </button>
      {open && (
        <div className="model-menu" style={{ width: 280 }}>
          {PERMS.map((p) => {
            const I = p.icon;
            return (
              <div key={p.id} className={`perm-row ${p.id === value ? "sel" : ""}`} onClick={() => { onChange(p.id); setOpen(false); }}>
                <I size={15} style={{ marginTop: 1, flex: "0 0 15px" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ color: "var(--text-0)" }}>{p.label}</div>
                  <div style={{ color: "var(--text-2)", fontSize: 11.5 }}>{p.desc}</div>
                </div>
                {p.id === value && <Check size={15} style={{ color: "var(--accent)" }} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Topbar({ mode, model, groups, onModel, onRefresh, permissionMode, onPermissionChange }) {
  const meta = MODES.find((m) => m.id === mode) || { label: mode, sub: "" };
  const agent = mode === "cowork" || mode === "code";
  return (
    <div className="topbar">
      <div>
        <div className="mode-title">{meta.label}</div>
        <div className="mode-sub">{meta.sub}</div>
      </div>
      <div className="spacer" />
      {agent && <PermissionPicker value={permissionMode} onChange={onPermissionChange} />}
      {mode !== "settings" && <ModelPicker value={model} groups={groups} onChange={onModel} onRefresh={onRefresh} />}
    </div>
  );
}
