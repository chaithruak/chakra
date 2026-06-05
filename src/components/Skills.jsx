import { useEffect, useState } from "react";
import { FolderPlus, FolderUp, Upload, Plus, Puzzle, RefreshCw, X, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { bridge } from "../bridge/index.js";

export default function Skills() {
  const [dirs, setDirs] = useState([]);
  const [skills, setSkills] = useState([]);
  const [newName, setNewName] = useState("");
  const [status, setStatus] = useState("");

  const refresh = async () => {
    const cfg = await bridge.getSettings();
    setDirs(cfg.skillsDirs || []);
    setSkills(await bridge.listSkills());
  };
  useEffect(() => { refresh(); }, []);

  const saveDirs = async (next) => {
    const cfg = await bridge.getSettings();
    await bridge.saveSettings({ ...cfg, skillsDirs: next });
    setDirs(next);
    setSkills(await bridge.listSkills());
  };

  const addFolder = async () => {
    const dir = await bridge.chooseFolder();
    if (!dir || dirs.includes(dir)) return;
    await saveDirs([...dirs, dir]);
    setStatus(`Added ${dir}`);
  };
  const removeFolder = async (d) => saveDirs(dirs.filter((x) => x !== d));

  const after = async (r, label) => {
    if (r?.canceled) return;
    if (r?.error) { setStatus(r.error); return; }
    setStatus(`${label}: ${r.dir}`);
    setSkills(await bridge.listSkills());
  };
  const create = async () => after(await bridge.createSkill(newName || "new-skill"), "Created");
  const importFolder = async () => after(await bridge.importSkillFolder(), "Imported");
  const importZip = async () => after(await bridge.importSkillZip(), "Imported");

  const toggleSkill = async (s) => { await bridge.setSkillEnabled(s.dir, !s.enabled); setSkills(await bridge.listSkills()); };
  const deleteSkill = async (s) => {
    if (!window.confirm(`Delete skill "${s.name}"? This removes the folder:\n${s.dir}`)) return;
    const r = await bridge.deleteSkill(s.dir);
    if (r?.error) setStatus(r.error); else setStatus(`Deleted ${s.name}`);
    setSkills(await bridge.listSkills());
  };

  return (
    <div className="settings scroll" style={{ padding: 24, overflow: "auto", maxWidth: 760 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 17 }}>Skills</h2>
      <p style={{ color: "var(--text-2)", fontSize: 13, marginTop: 0 }}>
        Chakra reads SKILL.md folders from every folder below — your own and, if you add it, the folder where Claude
        stores skills. The list is re-scanned on every message, so adds/edits show up in real time. New and imported
        skills go into the <b>first</b> folder.
      </p>

      <div className="nav-label" style={{ paddingLeft: 0 }}>Skill folders</div>
      {dirs.length === 0 && <div style={{ color: "var(--text-2)", fontSize: 13, margin: "6px 0" }}>No folders yet.</div>}
      {dirs.map((d, i) => (
        <div key={d} className="folder-bar" style={{ borderRadius: 10, border: "1px solid var(--line)", marginBottom: 6 }}>
          {i === 0 && <span className="badge">primary</span>}
          <span className="path">{d}</span>
          <button className="btn ghost" onClick={() => removeFolder(d)} style={{ marginLeft: "auto", padding: "4px 8px" }}><X size={14} /></button>
        </div>
      ))}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0 18px" }}>
        <button className="btn" onClick={addFolder}><FolderPlus size={14} /> Add folder</button>
        <button className="btn" onClick={importFolder}><FolderUp size={14} /> Import skill folder</button>
        <button className="btn" onClick={importZip}><Upload size={14} /> Import .zip / .skill</button>
        <button className="btn" onClick={refresh}><RefreshCw size={14} /> Reload</button>
      </div>

      <div className="nav-label" style={{ paddingLeft: 0 }}>Create a new skill (in the primary folder)</div>
      <div style={{ display: "flex", gap: 8, margin: "8px 0 4px" }}>
        <input className="model-search" style={{ flex: 1, marginBottom: 0 }} placeholder="new-skill-name"
          value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className="btn primary" onClick={create}><Plus size={14} /> Create</button>
      </div>
      {status && <div style={{ color: status.toLowerCase().includes("error") || status.includes("first") ? "var(--danger)" : "var(--text-2)", fontSize: 12, margin: "8px 0" }}>{status}</div>}

      <div className="nav-label" style={{ paddingLeft: 0, marginTop: 16 }}>Discovered skills ({skills.length})</div>
      {skills.length === 0 ? (
        <div style={{ color: "var(--text-2)", fontSize: 13, padding: "10px 0" }}>None found in the folders above.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {skills.map((s) => {
            const on = s.enabled !== false;
            return (
              <div key={s.dir} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", background: "var(--bg-1)", opacity: on ? 1 : 0.55 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Puzzle size={15} style={{ color: on ? "var(--accent)" : "var(--text-2)" }} />
                  <span style={{ fontWeight: 500 }}>{s.name}</span>
                  <span style={{ flex: 1 }} />
                  <button className="btn ghost" title={on ? "Disable" : "Enable"} onClick={() => toggleSkill(s)} style={{ padding: "3px 7px", color: on ? "var(--ok)" : "var(--text-2)" }}>
                    {on ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                  </button>
                  <button className="btn ghost danger" title="Delete skill" onClick={() => deleteSkill(s)} style={{ padding: "3px 7px" }}>
                    <Trash2 size={14} />
                  </button>
                </div>
                <div style={{ color: "var(--text-1)", fontSize: 13, marginTop: 4 }}>{s.description || "(no description)"}</div>
                <div style={{ color: "var(--text-2)", fontSize: 11, marginTop: 4, fontFamily: "var(--mono)" }}>{s.dir}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
