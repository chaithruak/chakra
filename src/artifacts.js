// Detect "artifacts" in assistant text: fenced code blocks that are worth rendering
// in the side panel (live HTML/SVG preview, or substantial code).
export function extractArtifacts(text) {
  if (!text) return [];
  const out = [];
  const re = /```([\w-]+)?\s*\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text))) {
    const lang = (m[1] || "").toLowerCase();
    const code = m[2].replace(/\s+$/, "");
    const looksHtml = /^\s*<(!doctype|html|svg|body|div|section|main|head)/i.test(code);
    const previewable = ["html", "htm", "svg", "xml"].includes(lang) || looksHtml;
    const big = code.trim().length > 280;
    if (previewable || big) {
      out.push({
        lang: lang || (previewable ? "html" : "code"),
        code,
        previewable,
        title: titleFor(lang, previewable),
      });
    }
  }
  return out;
}

function titleFor(lang, previewable) {
  if (["svg"].includes(lang)) return "SVG artifact";
  if (previewable) return "HTML artifact";
  if (lang) return lang.toUpperCase() + " snippet";
  return "Code artifact";
}

// Build the srcDoc for a previewable artifact.
export function artifactSrcDoc(a) {
  if (a.lang === "svg" || /^\s*<svg/i.test(a.code)) {
    return `<!doctype html><meta charset="utf-8"><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#fff">${a.code}</body>`;
  }
  if (/^\s*<!doctype|^\s*<html/i.test(a.code)) return a.code;
  return `<!doctype html><meta charset="utf-8"><body style="margin:0;font-family:system-ui">${a.code}</body>`;
}
