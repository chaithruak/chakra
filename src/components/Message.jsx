import ToolCard from "./ToolCard.jsx";

// Strip a leading raw-JSON blob some weak models prepend to their reply
// (e.g. {"status":"success","output":""} The folder was created.)
function cleanAssistant(t) {
  if (!t) return t;
  return t.replace(/^\s*\{[^{}]*\}\s*(?=[A-Za-z("'])/, "");
}

export default function Message({ item, streaming }) {
  if (item.type === "tool") {
    return <ToolCard {...item} />;
  }
  const isUser = item.role === "user";
  const text = isUser ? item.text : cleanAssistant(item.text);
  return (
    <div className={`msg ${isUser ? "user" : "assistant"}`}>
      <div className="avatar">{isUser ? "Y" : "C"}</div>
      <div className="body">
        <div className="who">{isUser ? "You" : "Chakra"}</div>
        <div className="content">
          {text}
          {streaming && <span className="cursor" />}
        </div>
      </div>
    </div>
  );
}
