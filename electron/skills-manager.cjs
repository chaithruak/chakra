// Skills — Claude-style progressive disclosure.
// A skill = a folder with SKILL.md (YAML frontmatter: name, description) + markdown body.
// The agent always sees the lightweight index (names+descriptions); it calls load_skill
// to pull a skill's full instructions only when relevant, then runs any bundled scripts.
const fs = require("fs");
const path = require("path");

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

function discover(skillsDir) {
  if (!skillsDir) return [];
  let entries;
  try { entries = fs.readdirSync(skillsDir, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const file = path.join(skillsDir, e.name, "SKILL.md");
    if (!fs.existsSync(file)) continue;
    try {
      const { meta } = parse(fs.readFileSync(file, "utf8"));
      out.push({ name: meta.name || e.name, description: meta.description || "", dir: path.join(skillsDir, e.name), file });
    } catch {}
  }
  return out;
}

function indexText(skills) {
  if (!skills.length) return "";
  return "You have these SKILLS. When the user's request matches one, call the load_skill tool " +
    "with its exact name to get the full instructions, then follow them:\n" +
    skills.map((s) => `- ${s.name}: ${s.description}`).join("\n");
}

function loadSkill(skillsDir, name) {
  const s = discover(skillsDir).find((x) => x.name === name || path.basename(x.dir) === name);
  if (!s) return null;
  const { body } = parse(fs.readFileSync(s.file, "utf8"));
  return { dir: s.dir, body };
}

function createStarter(skillsDir, name) {
  const safe = String(name || "new-skill").replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase() || "new-skill";
  const dir = path.join(skillsDir, safe);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "SKILL.md");
  if (!fs.existsSync(file)) {
    fs.writeFileSync(
      file,
      `---\nname: ${safe}\ndescription: One sentence on when Chakra should use this skill.\n---\n\n# ${safe}\n\nDescribe the steps Chakra should follow when this skill applies.\n\nYou can include helper scripts in this folder and run them with the run_bash tool,\ne.g. \`python "${dir}/script.py"\`. List any inputs the skill needs.\n`
    );
  }
  return { dir, file };
}

module.exports = { discover, indexText, loadSkill, createStarter };
