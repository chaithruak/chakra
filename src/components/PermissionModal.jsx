import { ShieldAlert, TerminalSquare, FilePen, FilePlus } from "lucide-react";

function summarize(toolName, input = {}) {
  const p = input.path || input.file_path || input.filePath || "";
  switch (toolName) {
    case "run_bash":
    case "Bash": return { icon: TerminalSquare, title: "Run a command", detail: input.command || "", mono: true };
    case "write_file":
    case "Write": return { icon: FilePlus, title: p ? `Create ${p}` : "Create a file", detail: "" };
    case "edit_file":
    case "Edit": return { icon: FilePen, title: p ? `Edit ${p}` : "Edit a file", detail: "" };
    default: return { icon: ShieldAlert, title: toolName, detail: JSON.stringify(input) };
  }
}

export default function PermissionModal({ req, onAllow, onAllowAlways, onDeny }) {
  if (!req) return null;
  const s = summarize(req.toolName, req.input);
  const Icon = s.icon;
  return (
    <div className="scrim">
      <div className="modal">
        <div className="modal-head">
          <Icon size={20} className="ic" />
          <h3>{s.title}?</h3>
        </div>
        <div className="modal-body">
          Chakra wants to make a change in your folder.
          {s.detail && <div className="tcall">{s.mono ? `$ ${s.detail}` : s.detail}</div>}
        </div>
        <div className="modal-actions">
          <button className="btn ghost danger" onClick={onDeny}>Decline</button>
          <span className="spacer" />
          <button className="btn" onClick={onAllowAlways}>Allow for session</button>
          <button className="btn primary" onClick={onAllow}>Allow once</button>
        </div>
      </div>
    </div>
  );
}
