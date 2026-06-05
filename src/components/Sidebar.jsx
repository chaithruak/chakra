import { MessageSquare, Code2, FolderKanban, Boxes, Puzzle, Plug, Settings, Plus } from "lucide-react";
import { MODES, SECONDARY } from "../bridge/contract.js";

const ICONS = {
  chat: MessageSquare, code: Code2, cowork: Boxes, project: FolderKanban,
  skills: Puzzle, connectors: Plug, settings: Settings,
};

const DEMO_PROJECTS = [
  { id: "p1", name: "chai-renderer", meta: "code" },
  { id: "p2", name: "earnings-deck", meta: "cowork" },
  { id: "p3", name: "research notes", meta: "chat" },
];

export default function Sidebar({ active, onSelect }) {
  return (
    <aside className="sidebar scroll">
      <div className="brand">
        <div className="mark">C</div>
        <div className="name">Chakra</div>
        <div className="tag">v0.1</div>
      </div>

      <button className="nav-item" style={{ color: "var(--text-0)" }} onClick={() => onSelect("chat")}>
        <Plus size={16} /> New session
      </button>

      <div className="nav-label">Modes</div>
      {MODES.map((m) => {
        const Icon = ICONS[m.id];
        return (
          <button key={m.id} className={`nav-item ${active === m.id ? "active" : ""}`} onClick={() => onSelect(m.id)}>
            <Icon size={16} /> {m.label} <span className="dot" />
          </button>
        );
      })}

      <div className="nav-label">Configure</div>
      {SECONDARY.map((s) => {
        const Icon = ICONS[s.id];
        return (
          <button key={s.id} className={`nav-item ${active === s.id ? "active" : ""}`} onClick={() => onSelect(s.id)}>
            <Icon size={16} /> {s.label} <span className="dot" />
          </button>
        );
      })}

      <div className="nav-label">Recent projects</div>
      <div className="proj-list scroll">
        {DEMO_PROJECTS.map((p) => (
          <div key={p.id} className="proj" onClick={() => onSelect("project")}>
            <FolderKanban size={15} /> {p.name} <span className="meta">{p.meta}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
