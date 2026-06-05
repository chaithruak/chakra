import { useEffect, useState } from "react";
import { Plus, FolderKanban, Trash2, FileText, FileUp, MessageSquarePlus, MessageSquare, Save } from "lucide-react";
import { bridge } from "../bridge/index.js";

export default function ProjectsBrowser({ onOpen }) {
  const [projects, setProjects] = useState([]);
  const [selId, setSelId] = useState(null);
  const [project, setProject] = useState(null);
  const [convs, setConvs] = useState([]);
  const [instr, setInstr] = useState("");
  const [name, setName] = useState("");
  const [newProj, setNewProj] = useState("");
  const [knText, setKnText] = useState("");
  const [status, setStatus] = useState("");

  const loadList = async () => setProjects(await bridge.listProjects());
  useEffect(() => { loadList(); }, []);

  const select = async (id) => {
    setSelId(id);
    const p = await bridge.getProject(id);
    setProject(p); setInstr(p?.instructions || ""); setName(p?.name || "");
    setConvs(await bridge.listConversations(id));
  };
  const refreshProject = async () => { const p = await bridge.getProject(selId); setProject(p); };

  const createProject = async () => {
    const p = await bridge.createProject(newProj || "Untitled project");
    setNewProj(""); await loadList(); select(p.id);
  };
  const saveMeta = async () => { await bridge.updateProject(selId, { name, instructions: instr }); setStatus("Saved"); loadList(); };
  const delProject = async () => {
    if (!window.confirm(`Delete project "${project.name}" and all its conversations?`)) return;
    await bridge.deleteProject(selId); setSelId(null); setProject(null); loadList();
  };

  const addText = async () => { if (!knText.trim()) return; await bridge.addKnowledgeText(selId, "Note", knText.trim()); setKnText(""); refreshProject(); };
  const addFile = async () => { const r = await bridge.addKnowledgeFile(selId); if (r?.error) setStatus(r.error); else refreshProject(); };
  const removeKn = async (knId) => { await bridge.removeKnowledge(selId, knId); refreshProject(); };

  const newConversation = async () => { const c = await bridge.createConversation(selId); onOpen(project, c); };
  const openConversation = async (c) => { onOpen(project, c); };
  const delConv = async (id) => { await bridge.deleteConversation(id); setConvs(await bridge.listConversations(selId)); };

  return (
    <div className="settings scroll" style={{ padding: 0, overflow: "hidden", display: "grid", gridTemplateColumns: "260px 1fr", height: "100%" }}>
      {/* projects list */}
      <div style={{ borderRight: "1px solid var(--line)", padding: 14, overflowY: "auto" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <input className="model-search" style={{ marginBottom: 0 }} placeholder="New project" value={newProj}
            onChange={(e) => setNewProj(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createProject()} />
          <button className="btn primary" onClick={createProject} style={{ padding: "0 10px" }}><Plus size={16} /></button>
        </div>
        {projects.length === 0 && <div style={{ color: "var(--text-2)", fontSize: 13, padding: "8px 4px" }}>No projects yet.</div>}
        {projects.map((p) => (
          <button key={p.id} className={`nav-item ${p.id === selId ? "active" : ""}`} onClick={() => select(p.id)}>
            <FolderKanban size={15} /> {p.name}
          </button>
        ))}
      </div>

      {/* project detail */}
      <div style={{ padding: 24, overflowY: "auto" }}>
        {!project ? (
          <div className="empty"><div><div className="big">Projects</div><div>Create a project, give it instructions and knowledge, then start conversations that all share that context.</div></div></div>
        ) : (
          <div style={{ maxWidth: 720 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <input className="model-search" style={{ marginBottom: 0, fontSize: 16, fontWeight: 500 }} value={name} onChange={(e) => setName(e.target.value)} />
              <button className="btn" onClick={saveMeta}><Save size={14} /> Save</button>
              <button className="btn ghost danger" onClick={delProject}><Trash2 size={14} /></button>
            </div>

            <div className="nav-label" style={{ paddingLeft: 0 }}>Custom instructions</div>
            <textarea className="model-search" rows={4} style={{ resize: "vertical", fontFamily: "inherit" }}
              placeholder="Tell Chakra how to behave in this project (tone, role, rules)…"
              value={instr} onChange={(e) => setInstr(e.target.value)} onBlur={saveMeta} />

            <div className="nav-label" style={{ paddingLeft: 0, marginTop: 12 }}>Project knowledge ({(project.knowledge || []).length})</div>
            <div style={{ display: "flex", gap: 8, margin: "6px 0" }}>
              <input className="model-search" style={{ flex: 1, marginBottom: 0 }} placeholder="Paste text knowledge…" value={knText} onChange={(e) => setKnText(e.target.value)} />
              <button className="btn" onClick={addText}><FileText size={14} /> Add text</button>
              <button className="btn" onClick={addFile}><FileUp size={14} /> Add files</button>
            </div>
            {(project.knowledge || []).map((k) => (
              <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", border: "1px solid var(--line)", borderRadius: 8, marginBottom: 6 }}>
                <FileText size={14} style={{ color: "var(--text-2)" }} />
                <span style={{ fontSize: 13 }}>{k.name}</span>
                <span style={{ color: "var(--text-2)", fontSize: 11 }}>{k.type} · {String(k.content || "").length} chars</span>
                <span style={{ flex: 1 }} />
                <button className="btn ghost" onClick={() => removeKn(k.id)} style={{ padding: "2px 6px" }}><Trash2 size={13} /></button>
              </div>
            ))}

            <div style={{ display: "flex", alignItems: "center", marginTop: 18 }}>
              <div className="nav-label" style={{ paddingLeft: 0, flex: 1 }}>Conversations</div>
              <button className="btn primary" onClick={newConversation}><MessageSquarePlus size={14} /> New conversation</button>
            </div>
            {convs.length === 0 && <div style={{ color: "var(--text-2)", fontSize: 13, padding: "8px 0" }}>No conversations yet.</div>}
            {convs.map((c) => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", border: "1px solid var(--line)", borderRadius: 8, marginTop: 6, cursor: "pointer", background: "var(--bg-1)" }} onClick={() => openConversation(c)}>
                <MessageSquare size={14} style={{ color: "var(--accent)" }} />
                <span style={{ fontSize: 13.5 }}>{c.title || "Conversation"}</span>
                <span style={{ color: "var(--text-2)", fontSize: 11 }}>{c.count || 0} msgs</span>
                <span style={{ flex: 1 }} />
                <button className="btn ghost" onClick={(e) => { e.stopPropagation(); delConv(c.id); }} style={{ padding: "2px 6px" }}><Trash2 size={13} /></button>
              </div>
            ))}
            {status && <div style={{ color: "var(--text-2)", fontSize: 12, marginTop: 10 }}>{status}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
