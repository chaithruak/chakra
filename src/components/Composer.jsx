import { useState, useRef } from "react";
import { ArrowUp, Square, Paperclip, AtSign } from "lucide-react";

export default function Composer({ mode, busy, onSend, onStop }) {
  const [text, setText] = useState("");
  const ref = useRef(null);

  const submit = () => {
    const t = text.trim();
    if (!t || busy) return;
    onSend(t);
    setText("");
    if (ref.current) ref.current.style.height = "auto";
  };

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  const grow = (e) => {
    setText(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
  };

  const placeholder = {
    chat: "Message Chakra…",
    code: "Describe a change to the repo…",
    cowork: "Ask Chakra to work on your folder…",
    project: "Continue this project…",
  }[mode] || "Message Chakra…";

  return (
    <div className="composer-wrap">
      <div className="composer">
        <textarea ref={ref} rows={1} value={text} placeholder={placeholder} onChange={grow} onKeyDown={onKey} />
        <div className="composer-row">
          {mode !== "chat" && <span className="chip"><AtSign size={12} /> context</span>}
          <span className="chip"><Paperclip size={12} /> attach</span>
          {busy ? (
            <button className="send" onClick={onStop} title="Stop" style={{ background: "var(--bg-3)" }}>
              <Square size={14} />
            </button>
          ) : (
            <button className="send" onClick={submit} disabled={!text.trim()} title="Send">
              <ArrowUp size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
