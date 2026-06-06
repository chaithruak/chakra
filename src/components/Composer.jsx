import { useState, useRef, useEffect } from "react";
import { ArrowUp, Square, Paperclip, X, FileText, Plus, Mic, Github, Puzzle, Plug, Palette, FolderKanban, ChevronRight } from "lucide-react";

export default function Composer({ mode, busy, onSend, onStop, onNavigate }) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]); // { name, content }
  const [menuOpen, setMenuOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const ref = useRef(null);
  const fileRef = useRef(null);
  const menuRef = useRef(null);
  const recRef = useRef(null);

  useEffect(() => {
    const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const onPick = (e) => {
    const list = Array.from(e.target.files || []);
    list.forEach((f) => {
      const r = new FileReader();
      r.onload = () => setFiles((prev) => [...prev, { name: f.name, content: String(r.result || "").slice(0, 20000) }]);
      r.readAsText(f);
    });
    e.target.value = "";
  };
  const pickFiles = () => { setMenuOpen(false); fileRef.current && fileRef.current.click(); };
  const removeFile = (i) => setFiles((prev) => prev.filter((_, idx) => idx !== i));
  const nav = (m) => { setMenuOpen(false); onNavigate && onNavigate(m); };

  const submit = () => {
    const t = text.trim();
    if ((!t && files.length === 0) || busy) return;
    const attached = files.map((f) => `--- Attached file: ${f.name} ---\n${f.content}`).join("\n\n");
    const full = attached ? `${attached}\n\n${t}` : t;
    onSend(full);
    setText("");
    setFiles([]);
    if (ref.current) ref.current.style.height = "auto";
  };

  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "u" || e.key === "U")) { e.preventDefault(); pickFiles(); return; }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  };
  const grow = (e) => {
    setText(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
  };

  const toggleMic = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Voice input isn't available in this build. It needs a speech engine; a Whisper endpoint can be wired in."); return; }
    if (listening) { try { recRef.current && recRef.current.stop(); } catch {} return; }
    try {
      const rec = new SR();
      rec.lang = "en-US"; rec.interimResults = false; rec.continuous = false;
      rec.onresult = (e) => { const t = e.results[0][0].transcript; setText((p) => (p ? p + " " : "") + t); };
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);
      rec.start(); setListening(true); recRef.current = rec;
    } catch { setListening(false); }
  };

  const placeholder = {
    chat: "Message Chai…",
    code: "Describe a change to the repo…",
    cowork: "Ask Chai to work on your folder…",
    project: "Continue this project…",
  }[mode] || "Message Chai…";
  const canSend = !!text.trim() || files.length > 0;

  return (
    <div className="composer-wrap">
      <div className="composer">
        {files.length > 0 && (
          <div className="composer-files">
            {files.map((f, i) => (
              <span key={i} className="file-chip"><FileText size={12} /> {f.name}
                <button className="file-x" onClick={() => removeFile(i)} title="Remove"><X size={11} /></button>
              </span>
            ))}
          </div>
        )}
        <textarea ref={ref} rows={1} value={text} placeholder={placeholder} onChange={grow} onKeyDown={onKey} />
        <div className="composer-row">
          <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={onPick} />

          <div className="plus-wrap" ref={menuRef}>
            <button className="icon-btn" onClick={() => setMenuOpen((o) => !o)} title="Add"><Plus size={17} /></button>
            {menuOpen && (
              <div className="plus-menu">
                <button className="plus-item" onClick={pickFiles}><Paperclip size={15} /> Add files or photos <span className="kbd">Ctrl+U</span></button>
                <button className="plus-item" onClick={() => nav("project")}><FolderKanban size={15} /> Add to project <ChevronRight size={14} className="pm-chev" /></button>
                <button className="plus-item" onClick={() => nav("project")}><Github size={15} /> Add from GitHub</button>
                <div className="plus-sep" />
                <button className="plus-item" onClick={() => nav("skills")}><Puzzle size={15} /> Skills <ChevronRight size={14} className="pm-chev" /></button>
                <button className="plus-item" onClick={() => nav("connectors")}><Plug size={15} /> Connectors <ChevronRight size={14} className="pm-chev" /></button>
                <div className="plus-sep" />
                <button className="plus-item" onClick={() => nav("settings")}><Palette size={15} /> Use style / instructions</button>
              </div>
            )}
          </div>

          <span style={{ flex: 1 }} />

          <button className={`icon-btn ${listening ? "rec" : ""}`} onClick={toggleMic} title="Voice input"><Mic size={16} /></button>
          {busy ? (
            <button className="send" onClick={onStop} title="Stop" style={{ background: "var(--bg-3)" }}><Square size={14} /></button>
          ) : (
            <button className="send" onClick={submit} disabled={!canSend} title="Send"><ArrowUp size={16} /></button>
          )}
        </div>
      </div>
    </div>
  );
}
