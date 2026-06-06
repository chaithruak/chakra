import { useState } from "react";
import { Folder, FileText, FilePlus, FilePen, TerminalSquare, Search, Wrench, Loader2, ChevronRight } from "lucide-react";

// Turn a raw tool call into a human sentence + icon, like Cowork.
function describe(name, input = {}) {
  const p = input.path || input.file_path || input.filePath || "";
  switch (name) {
    case "list_dir":
    case "Glob": return { icon: Folder, verb: "Listed", obj: input.path || input.pattern || "folder" };
    case "read_file":
    case "Read": return { icon: FileText, verb: "Read", obj: p };
    case "write_file":
    case "Write": return { icon: FilePlus, verb: "Created", obj: p || "file" };
    case "edit_file":
    case "Edit": return { icon: FilePen, verb: "Edited", obj: p || "file" };
    case "run_bash":
    case "Bash": return { icon: TerminalSquare, verb: "Ran", obj: input.command || "command", mono: true };
    case "Grep":
    case "search_text": return { icon: Search, verb: "Searched", obj: input.pattern || input.query || "" };
    case "find_files": return { icon: Search, verb: "Found files", obj: input.pattern || "" };
    default: return { icon: Wrench, verb: name, obj: "" };
  }
}

export default function ToolCard({ name, input, output, status }) {
  const [open, setOpen] = useState(false);
  const d = describe(name, input);
  const Icon = d.icon;

  return (
    <div className={`tool2 ${status}`}>
      <button className="tool2-row" onClick={() => setOpen((o) => !o)}>
        <ChevronRight size={14} className="chev" style={{ transform: open ? "rotate(90deg)" : "none" }} />
        <span className="tool2-ic"><Icon size={15} /></span>
        <span className="tool2-text">
          <span className="verb">{d.verb}</span>{" "}
          <span className={`obj ${d.mono ? "mono" : ""}`}>{d.obj}</span>
        </span>
        <span className="tool2-status">
          {status === "run" && <Loader2 size={13} className="spin" />}
          {status === "deny" && <span className="s-deny">declined</span>}
        </span>
      </button>
      {open && (
        <div className="tool2-detail">
          {d.mono && input && input.command && (
            <pre className="mono-block"><span className="prompt">$</span> {input.command}</pre>
          )}
          {!d.mono && input && Object.keys(input).length > 0 && (
            <pre className="mono-block dim">{JSON.stringify(input, null, 2)}</pre>
          )}
          {output && <pre className="mono-block out">{output}</pre>}
        </div>
      )}
    </div>
  );
}
