// Persists provider profiles to userData/chai-settings.json.
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

function file() {
  return path.join(app.getPath("userData"), "chai-settings.json");
}

const DEFAULTS = {
  activeProfileId: "p_local",
  connectors: [],
  skillsDir: "",
  skillsDirs: [],
  disabledSkills: [],
  account: { name: "", email: "", avatar: "", googleLinked: false, anthropicLinked: false },
  googleClientId: "",
  googleClientSecret: "",
  profiles: {
    p_local: {
      id: "p_local",
      name: "LM Studio (local)",
      kind: "openai", // "openai" | "anthropic"
      baseUrl: "http://localhost:1234",
      apiKey: "",
      model: "local-model",
    },
    p_openrouter: {
      id: "p_openrouter",
      name: "OpenRouter",
      kind: "openai",
      baseUrl: "https://openrouter.ai/api",
      apiKey: "",
      model: "deepseek/deepseek-chat",
    },
    p_anthropic: {
      id: "p_anthropic",
      name: "Anthropic",
      kind: "anthropic",
      baseUrl: "https://api.anthropic.com",
      apiKey: "",
      model: "claude-sonnet-4-6",
    },
  },
};

function load() {
  try {
    const raw = fs.readFileSync(file(), "utf8");
    const data = JSON.parse(raw);
    // shallow-merge defaults so new fields appear for old config files
    const merged = { ...DEFAULTS, ...data, profiles: { ...DEFAULTS.profiles, ...(data.profiles || {}) } };
    if (!Array.isArray(merged.skillsDirs)) merged.skillsDirs = [];
    if (merged.skillsDirs.length === 0 && merged.skillsDir) merged.skillsDirs = [merged.skillsDir]; // migrate single → list
    if (merged.profiles.p_proxy) delete merged.profiles.p_proxy; // free-claude-code proxy removed
    if (merged.activeProfileId === "p_proxy") merged.activeProfileId = Object.keys(merged.profiles)[0];
    return merged;
  } catch {
    return DEFAULTS;
  }
}

function save(settings) {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(settings, null, 2), "utf8");
  return settings;
}

function activeProfile(settings) {
  const s = settings || load();
  return s.profiles[s.activeProfileId] || Object.values(s.profiles)[0];
}

module.exports = { load, save, activeProfile, DEFAULTS };
