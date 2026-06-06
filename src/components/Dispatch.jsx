import { useEffect, useState } from "react";
import { Plus, Send, Trash2, Play, Clock, FolderInput, Loader2 } from "lucide-react";
import { bridge } from "../bridge/index.js";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Dispatch() {
  const [tasks, setTasks] = useState([]);
  const [selId, setSelId] = useState(null);
  const [task, setTask] = useState(null);
  const [projects, setProjects] = useState([]);
  const [runs, setRuns] = useState([]);
  const [running, setRunning] = useState(false);

  const load = async () => setTasks(await bridge.listTasks());
  useEffect(() => { load(); bridge.listProjects().then(setProjects); }, []);

  const select = async (id) => {
    setSelId(id);
    const t = (await bridge.listTasks()).find((x) => x.id === id);
    setTask(t); setRuns(await bridge.getRuns(id));
  };
  const create = async () => { const t = await bridge.createTask(); await load(); select(t.id); };
  const del = async () => { await bridge.deleteTask(selId); setSelId(null); setTask(null); load(); };

  const save = async (patch) => {
    const next = { ...task, ...patch };
    setTask(next);
    await bridge.updateTask(selId, patch);
    load();
  };
  const saveTarget = (p) => save({ target: { ...task.target, ...p } });
  const saveSchedule = (p) => save({ schedule: { ...task.schedule, ...p } });

  const pickFolder = async () => { const dir = await bridge.chooseFolder(); if (dir) saveTarget({ type: "folder", folder: dir }); };

  const runNow = async () => {
    setRunning(true);
    try { await bridge.runTaskNow(selId); setRuns(await bridge.getRuns(selId)); load(); }
    finally { setRunning(false); }
  };

  const sc = task?.schedule || {};

  return (
    <div className="settings scroll" style={{ padding: 0, overflow: "hidden", display: "grid", gridTemplateColumns: "260px 1fr", height: "100%" }}>
      <div style={{ borderRight: "1px solid var(--line)", padding: 14, overflowY: "auto" }}>
        <button className="btn primary" onClick={create} style={{ width: "100%", marginBottom: 10, justifyContent: "center" }}><Plus size={15} /> New task</button>
        {tasks.length === 0 && <div style={{ color: "var(--text-2)", fontSize: 13, padding: "8px 4px" }}>No tasks yet.</div>}
        {tasks.map((t) => (
          <button key={t.id} className={`nav-item ${t.id === selId ? "active" : ""}`} onClick={() => select(t.id)}>
            <Send size={14} /> {t.name}
            {t.schedule && t.schedule.mode !== "off" && <Clock size={12} style={{ marginLeft: "auto", color: "var(--accent)" }} />}
          </button>
        ))}
      </div>

      <div style={{ padding: 24, overflowY: "auto" }}>
        {!task ? (
          <div className="empty"><div><div className="big">Dispatch</div><div>Create a task with a prompt, run it on demand, or schedule it to run automatically. Results are saved below.</div></div></div>
        ) : (
          <div style={{ maxWidth: 720 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <input className="model-search" style={{ marginBottom: 0, fontSize: 16, fontWeight: 500 }} value={task.name} onChange={(e) => setTask({ ...task, name: e.target.value })} onBlur={(e) => save({ name: e.target.value })} />
              <button className="btn primary" onClick={runNow} disabled={running}>{running ? <Loader2 size={14} className="spin" /> : <Play size={14} />} Run now</button>
              <button className="btn ghost danger" onClick={del}><Trash2 size={14} /></button>
            </div>

            <div className="nav-label" style={{ paddingLeft: 0 }}>Prompt / instructions</div>
            <textarea className="model-search" rows={4} style={{ resize: "vertical", fontFamily: "inherit" }}
              placeholder="What should Chakra do each run? e.g. 'Summarize new files in the linked folder.'"
              value={task.prompt} onChange={(e) => setTask({ ...task, prompt: e.target.value })} onBlur={(e) => save({ prompt: e.target.value })} />

            <div className="nav-label" style={{ paddingLeft: 0, marginTop: 12 }}>Run against</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select className="model-search" style={{ marginBottom: 0, width: 150 }} value={task.target?.type || "chat"} onChange={(e) => saveTarget({ type: e.target.value })}>
                <option value="chat">Plain chat</option>
                <option value="project">A project</option>
                <option value="folder">A folder</option>
              </select>
              {task.target?.type === "project" && (
                <select className="model-search" style={{ marginBottom: 0, flex: 1 }} value={task.target?.projectId || ""} onChange={(e) => saveTarget({ projectId: e.target.value })}>
                  <option value="">Select project…</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
              {task.target?.type === "folder" && (
                <>
                  <button className="btn" onClick={pickFolder}><FolderInput size={14} /> Choose folder</button>
                  {task.target?.folder && <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--text-1)" }}>{task.target.folder}</span>}
                </>
              )}
            </div>

            <div className="nav-label" style={{ paddingLeft: 0, marginTop: 12 }}>Schedule</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select className="model-search" style={{ marginBottom: 0, width: 150 }} value={sc.mode || "off"} onChange={(e) => saveSchedule({ mode: e.target.value })}>
                <option value="off">Off (manual only)</option>
                <option value="interval">Every N minutes</option>
                <option value="daily">Daily at time</option>
                <option value="weekly">Weekly</option>
              </select>
              {sc.mode === "interval" && (
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>every
                  <input className="model-search" type="number" min="1" style={{ marginBottom: 0, width: 80 }} value={sc.everyMinutes || 60} onChange={(e) => saveSchedule({ everyMinutes: Number(e.target.value) })} /> min</span>
              )}
              {sc.mode === "weekly" && (
                <select className="model-search" style={{ marginBottom: 0, width: 110 }} value={sc.weekday ?? 1} onChange={(e) => saveSchedule({ weekday: Number(e.target.value) })}>
                  {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              )}
              {(sc.mode === "daily" || sc.mode === "weekly") && (
                <input className="model-search" type="time" style={{ marginBottom: 0, width: 120 }} value={sc.time || "09:00"} onChange={(e) => saveSchedule({ time: e.target.value })} />
              )}
            </div>
            <p style={{ color: "var(--text-2)", fontSize: 12, marginTop: 8 }}>
              Scheduled runs are unattended, so they auto-approve tools (no permission prompts). The app must be open for schedules to fire. Uses the active provider.
            </p>

            <div className="nav-label" style={{ paddingLeft: 0, marginTop: 16 }}>Recent runs</div>
            {runs.length === 0 ? (
              <div style={{ color: "var(--text-2)", fontSize: 13, padding: "8px 0" }}>No runs yet. Hit "Run now".</div>
            ) : runs.map((r, i) => (
              <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", marginTop: 8, background: "var(--bg-1)" }}>
                <div style={{ display: "flex", gap: 8, fontSize: 12, color: "var(--text-2)" }}>
                  <span style={{ color: r.status === "error" ? "var(--danger)" : "var(--ok)" }}>{r.status}</span>
                  <span>{new Date(r.at).toLocaleString()}</span>
                </div>
                <div style={{ fontSize: 13, marginTop: 6, whiteSpace: "pre-wrap", maxHeight: 220, overflow: "auto" }}>{r.output}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
