import { useEffect, useState } from "react";
import { MessageSquare, Code2, FolderKanban, Boxes, Puzzle, Plug, Settings, Plus, Send } from "lucide-react";
import { MODES, SECONDARY } from "../bridge/contract.js";
import { bridge } from "../bridge/index.js";

const ICONS = {
  chat: MessageSquare, code: Code2, cowork: Boxes, project: FolderKanban,
  skills: Puzzle, connectors: Plug, dispatch: Send, settings: Settings,
};

export default function Sidebar({ active, onSelect }) {
  const [recent, setRecent] = useState([]);
  useEffect(() => {
    let alive = true;
    const load = () => bridge.listProjects().then((p) => alive && setRecent((p || []).slice(0, 5)));
    load();
    const t = setInterval(load, 8000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  return (
    <aside className="sidebar glass">
      <div className="brand">
        <div className="mark tea">
          <svg viewBox="0 0 28 28" width="22" height="22" aria-hidden="true">
            <g className="steam" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" fill="none">
              <path d="M10 7.5c-1.3-1.2 1.3-2.4 0-3.7" />
              <path d="M14 7.5c-1.3-1.2 1.3-2.4 0-3.7" />
              <path d="M18 7.5c-1.3-1.2 1.3-2.4 0-3.7" />
            </g>
            <path d="M5 11h13.5v4.6A5.4 5.4 0 0 1 13.1 21h-2.7A5.4 5.4 0 0 1 5 15.6V11z" fill="#fff" />
            <path d="M18.5 12.2h2.1a2.5 2.5 0 0 1 0 5H18.5" fill="none" stroke="#fff" strokeWidth="1.6" />
            <path d="M6.5 23.2h11" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </div>
        <div className="name">Chai</div>
        <div className="tag">v0.1</div>
      </div>

      <button className="new-btn" onClick={() => onSelect("chat")}>
        <Plus size={16} /> New session
      </button>

      <div className="nav-label">Workspaces</div>
      <div className="mode-stack">
        {MODES.map((m) => {
          const Icon = ICONS[m.id];
          return (
            <button key={m.id} className={`mode-tile ${active === m.id ? "active" : ""}`} onClick={() => onSelect(m.id)}>
              <span className="mt-ico"><Icon size={16} /></span>
              <span className="mt-text">
                <span className="mt-name">{m.label}</span>
                <span className="mt-sub">{m.sub}</span>
              </span>
            </button>
          );
        })}
      </div>

      {recent.length > 0 && (
        <>
          <div className="nav-label">Recent projects</div>
          <div className="proj-list scroll">
            {recent.map((p) => (
              <div key={p.id} className="proj" onClick={() => onSelect("project")}>
                <FolderKanban size={15} /> {p.name}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="sidebar-spacer" />

      <div className="tool-rail">
        {SECONDARY.map((s) => {
          const Icon = ICONS[s.id];
          return (
            <button key={s.id} className={`tool-tile ${active === s.id ? "active" : ""}`} onClick={() => onSelect(s.id)} title={s.label}>
              <Icon size={17} />
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
