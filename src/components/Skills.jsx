import { useEffect, useState } from "react";
import { FolderOpen, Plus, Puzzle, RefreshCw } from "lucide-react";
import { bridge } from "../bridge/index.js";

export default function Skills() {
  const [skillsDir, setSkillsDir] = useState("");
  const [skills, setSkills] = useState([]);
  const [newName, setNewName] = useState("");
  const [status, setStatus] = useState("");

  const refresh = async () => {
    const cfg = await bridge.getSettings();
    setSkillsDir(cfg.skillsDir || "");
    setSkills(await bridge.listSkills());
  };
  useEffect(() => { refresh(); }, []);

  const pickFolder = async () => {
    const dir = await bridge.chooseFolder();
    if (!dir) return;
    const cfg = await bridge.getSettings();
    await bridge.saveSettings({ ...cfg, skillsDir: dir });
    setSkillsDir(dir);
    setSkills(await bridge.listSkills());
  };

  const create = async () => {
    if (!skillsDir) { setStatus("Set a skills folder first."); return; }
    const r = await bridge.createSkill(newName || "new-skill");
    if (r.error) { setStatus(r.error); return; }
    setStatus(`Created ${r.file}`);
    setNewName("");
    setSkills(await bridge.listSkills());
  };

  return (
    <div className="settings scroll" style={{ padding: 24, overflow: "auto", maxWidth: 720 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 17 }}>Skills</h2>
      <p style={{ color: "var(--text-2)", fontSize: 13, marginTop: 0 }}>
        A skill is a folder with a <span style={{ fontFamily: "var(--mono)" }}>SKILL.md</span> (name + description + instructions).
        Chakra sees the list everywhere — Chat, Code, Cowork, Projects — and loads a skill's full instructions only when your request matches.
      </p>

      <div className="folder-bar" style={{ borderRadius: 10, border: "1px solid var(--line)" }}>
        <FolderOpen size={14} />
        {skillsDir ? <span className="path">{skillsDir}</span> : <span className="path muted">No skills folder set</span>}
        <button className="btn" onClick={pickFolder} style={{ marginLeft: "auto", padding: "5px 10px" }}>
          {skillsDir ? "Change folder" : "Choose folder"}
        </button>
        <button className="btn" onClick={refresh} style={{ padding: "5px 9px" }} title="Reload"><RefreshCw size={14} /></button>
      </div>

      <div style={{ display: "flex", gap: 8, margin: "16px 0" }}>
        <input className="model-search" style={{ flex: 1, marginBottom: 0 }} placeholder="new-skill-name"
          value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className="btn primary" onClick={create}><Plus size={14} /> Create skill</button>
      </div>
      {status && <div style={{ color: "var(--text-2)", fontSize: 12, marginBottom: 12 }}>{status}</div>}

      <div className="nav-label" style={{ paddingLeft: 0 }}>Discovered skills ({skills.length})</div>
      {skills.length === 0 ? (
        <div style={{ color: "var(--text-2)", fontSize: 13, padding: "10px 0" }}>
          None yet. Set a folder and create one, or drop SKILL.md folders in and hit reload.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {skills.map((s) => (
            <div key={s.dir} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", background: "var(--bg-1)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Puzzle size={15} style={{ color: "var(--accent)" }} />
                <span style={{ fontWeight: 500 }}>{s.name}</span>
              </div>
              <div style={{ color: "var(--text-1)", fontSize: 13, marginTop: 4 }}>{s.description || "(no description)"}</div>
              <div style={{ color: "var(--text-2)", fontSize: 11, marginTop: 4, fontFamily: "var(--mono)" }}>{s.dir}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
