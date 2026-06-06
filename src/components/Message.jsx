import { LayoutTemplate } from "lucide-react";
import ToolCard from "./ToolCard.jsx";
import { extractArtifacts } from "../artifacts.js";

// Strip a leading raw-JSON blob some weak models prepend to their reply
// (e.g. {"status":"success","output":""} The folder was created.)
function cleanAssistant(t) {
  if (!t) return t;
  return t.replace(/^\s*\{[^{}]*\}\s*(?=[A-Za-z("'])/, "");
}

export default function Message({ item, streaming, onOpenArtifact }) {
  if (item.type === "tool") {
    return <ToolCard {...item} />;
  }
  const isUser = item.role === "user";
  const text = isUser ? item.text : cleanAssistant(item.text);
  const artifacts = isUser || streaming ? [] : extractArtifacts(item.text);
  return (
    <div className={`msg ${isUser ? "user" : "assistant"}`}>
      <div className="avatar">{isUser ? "Y" : "C"}</div>
      <div className="body">
        <div className="who">{isUser ? "You" : "Chai"}</div>
        <div className="content">
          {text}
          {streaming && <span className="cursor" />}
        </div>
        {artifacts.map((a, i) => (
          <span key={i} className="artifact-pill" onClick={() => onOpenArtifact && onOpenArtifact(a)}>
            <LayoutTemplate size={13} /> Open {a.title}
          </span>
        ))}
      </div>
    </div>
  );
}
