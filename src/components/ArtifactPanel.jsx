import { useState } from "react";
import { X, Eye, Code as CodeIcon, ExternalLink } from "lucide-react";
import { artifactSrcDoc } from "../artifacts.js";

export default function ArtifactPanel({ artifact, onClose }) {
  const [tab, setTab] = useState(artifact.previewable ? "preview" : "code");

  return (
    <div className="artifact-wrap" style={{ width: "46%", maxWidth: 720 }}>
      <div className="artifact-head">
        <span style={{ fontWeight: 500 }}>{artifact.title}</span>
        <div className="artifact-tabs">
          {artifact.previewable && (
            <button className={`artifact-tab ${tab === "preview" ? "active" : ""}`} onClick={() => setTab("preview")}><Eye size={13} /> Preview</button>
          )}
          <button className={`artifact-tab ${tab === "code" ? "active" : ""}`} onClick={() => setTab("code")}><CodeIcon size={13} /> Code</button>
        </div>
        <button className="btn ghost" onClick={onClose} style={{ padding: "5px 7px" }}><X size={15} /></button>
      </div>
      <div className="artifact-body">
        {tab === "preview" && artifact.previewable ? (
          <iframe className="artifact-frame" sandbox="allow-scripts allow-forms allow-popups" srcDoc={artifactSrcDoc(artifact)} title="artifact preview" />
        ) : (
          <pre className="artifact-code">{artifact.code}</pre>
        )}
      </div>
    </div>
  );
}
