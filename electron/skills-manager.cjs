// Skills — Claude-style progressive disclosure, across one or more skill folders.
// A skill = a folder containing SKILL.md (YAML frontmatter name/description + body).
// Discovery is recursive (Claude nests skills) and runs fresh each turn, so adding or
// editing a skill on disk is reflected in real time on the next message.
const fs = require("fs");
const path = require("path");

const SKIP = new Set(["node_modules", ".git", ".venv", "venv", "__pycache__", "dist", "build"]);
const MAX_DEPTH = 5;

function parse(text) {
  const m = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  m[1].split(/\r?\n/).forEach((line) => {
    const i = line.indexOf(":");
    if (i > 0) {
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      meta[k] = v;
    }
  });
  return { meta, body: m[2] };
}

function walk(root, depth, acc) {
  if (depth < 0) return;
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.isFile() && e.name === "SKILL.md") {
      try {
        const { meta } = parse(fs.readFileSync(path.join(root, "SKILL.md"), "utf8"));
        acc.push({ name: meta.name || path.basename(root), description: meta.description || "", dir: root, file: path.join(root, "SKILL.md") });
      } catch {}
    }
  }
  for (const e of entries) {
    if (e.isDirectory() && !SKIP.has(e.name) && !e.name.startsWith(".")) {
      walk(path.join(root, e.name), depth - 1, acc);
    }
  }
}

function roots(dirs) {
  if (Array.isArray(dirs)) return dirs.filter(Boolean);
  return dirs ? [dirs] : [];
}

function discover(dirs) {
  const acc = [];
  for (const r of roots(dirs)) walk(r, MAX_DEPTH, acc);
  const seen = new Set();
  const out = [];
  for (const s of acc) { if (seen.has(s.name)) continue; seen.add(s.name); out.push(s); }
  return out;
}

function indexText(skills) {
  if (!skills.length) return "";
  return "You have these SKILLS. When the user's request matches one, call the load_skill tool " +
    "with its exact name to get the full instructions, then follow them:\n" +
    skills.map((s) => `- ${s.name}: ${s.description}`).join("\n");
}

function loadSkill(dirs, name) {
  const s = discover(dirs).find((x) => x.name === name || path.basename(x.dir) === name);
  if (!s) return null;
  const { body } = parse(fs.readFileSync(s.file, "utf8"));
  return { dir: s.dir, body };
}

function createStarter(dir, name) {
  const safe = String(name || "new-skill").replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase() || "new-skill";
  const d = path.join(dir, safe);
  fs.mkdirSync(d, { recursive: true });
  const file = path.join(d, "SKILL.md");
  if (!fs.existsSync(file)) {
    fs.writeFileSync(
      file,
      `---\nname: ${safe}\ndescription: One sentence on when Chakra should use this skill.\n---\n\n# ${safe}\n\nDescribe the steps Chakra should follow when this skill applies.\n\nYou can include helper scripts in this folder and run them with the run_bash tool,\ne.g. \`python "${d}/script.py"\`. List any inputs the skill needs.\n`
    );
  }
  return { dir: d, file };
}

module.exports = { discover, indexText, loadSkill, createStarter };
