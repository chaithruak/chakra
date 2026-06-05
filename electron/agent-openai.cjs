// Self-built agent loop for OpenAI-compatible providers (NIM, OpenRouter, local).
// No proxy, no Anthropic dependency — Chakra runs the tool-calling loop itself,
// in-process, against the active external model. Emits the same UiEvents as the SDK path.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { streamChatTools } = require("./providers.cjs");

// ---- tool schemas (OpenAI function-calling format) ----
const TOOLS = [
  { type: "function", function: { name: "list_dir", description: "List files in a directory (relative to the working folder).",
    parameters: { type: "object", properties: { path: { type: "string", description: "dir path, default '.'" } } } } },
  { type: "function", function: { name: "read_file", description: "Read a UTF-8 text file.",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
  { type: "function", function: { name: "write_file", description: "Create or overwrite a text file.",
    parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } } },
  { type: "function", function: { name: "edit_file", description: "Replace the first exact occurrence of old_string with new_string in a file.",
    parameters: { type: "object", properties: { path: { type: "string" }, old_string: { type: "string" }, new_string: { type: "string" } }, required: ["path", "old_string", "new_string"] } } },
  { type: "function", function: { name: "run_bash", description: "Run a shell command in the working folder.",
    parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } } },
];

// Reads are always safe. Whether a *mutating* tool runs without asking depends on
// the user-selected permission mode, not the chat mode.
const READS = new Set(["list_dir", "read_file"]);

// permMode: "default" (ask before changes) | "acceptEdits" | "bypass" (act, trust all) | "plan" (read-only)
function isAuto(permMode, name) {
  if (READS.has(name)) return true;
  if (permMode === "bypass") return true;
  if (permMode === "acceptEdits") return name === "write_file" || name === "edit_file"; // edits auto, bash still asks
  return false; // "default" → ask for every mutation; "plan" handled by isBlocked
}
function isBlocked(permMode, name) {
  return permMode === "plan" && !READS.has(name); // plan = read-only
}

const SYSTEM = (mode) =>
  `You are Chakra, an AI assistant working inside the user's "${mode}" folder. ` +
  `Use the provided tools to inspect and modify files; take real actions rather than describing them. Use relative paths. ` +
  `When you reply to the user, write ONE short, friendly sentence in plain English about what you did. ` +
  `Never put JSON, tool names, field names like "status" or "output", code fences, or raw command output in your reply — ` +
  `the user already sees the tool activity separately. Example reply: "Created the folder sharmila."`;

// Keep file access inside the chosen folder.
function inside(cwd, p) {
  const abs = path.resolve(cwd, p || ".");
  const root = path.resolve(cwd);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error("path escapes the working folder");
  return abs;
}

function execTool(cwd, name, args) {
  switch (name) {
    case "list_dir": {
      const dir = inside(cwd, args.path || ".");
      return fs.readdirSync(dir, { withFileTypes: true })
        .map((d) => (d.isDirectory() ? d.name + "/" : d.name)).join("\n") || "(empty)";
    }
    case "read_file":
      return fs.readFileSync(inside(cwd, args.path), "utf8").slice(0, 8000);
    case "write_file":
      fs.mkdirSync(path.dirname(inside(cwd, args.path)), { recursive: true });
      fs.writeFileSync(inside(cwd, args.path), args.content == null ? "" : args.content);
      return "wrote " + args.path;
    case "edit_file": {
      const f = inside(cwd, args.path);
      let t = fs.readFileSync(f, "utf8");
      if (!t.includes(args.old_string)) throw new Error("old_string not found in " + args.path);
      fs.writeFileSync(f, t.replace(args.old_string, args.new_string == null ? "" : args.new_string));
      return "edited " + args.path;
    }
    case "run_bash":
      return String(execSync(args.command, { cwd, encoding: "utf8", timeout: 30000 })).slice(0, 8000);
    default:
      throw new Error("unknown tool " + name);
  }
}

function askPermission(emit, permissions, toolUseId, toolName, input) {
  return new Promise((resolve) => {
    const requestId = "perm_" + Math.random().toString(36).slice(2, 9);
    permissions.set(requestId, (res) => resolve(res && res.behavior === "allow"));
    emit({ kind: "permission_request", data: { requestId, toolName, input, toolUseId } });
  });
}

async function runOpenAIAgentTurn({ prompt, mode, cwd, profile, history, emit, permissions, signal, permMode = "default" }) {
  if (history.length === 0) history.push({ role: "system", content: SYSTEM(mode) });
  history.push({ role: "user", content: prompt });

  emit({ kind: "init", data: { model: profile.model, cwd, mode, permissionMode: permMode } });

  const started = Date.now();
  const MAX_STEPS = 12;
  for (let step = 0; step < MAX_STEPS; step++) {
    let result;
    try {
      result = await streamChatTools(profile, history, TOOLS, {
        signal,
        onDelta: () => {}, // buffer; reveal text only after we know whether tools were called
      });
    } catch (e) {
      if (e.name === "AbortError") { emit({ kind: "result", data: { subtype: "interrupted" } }); return; }
      emit({ kind: "error", data: { code: e.code || "error", message: String(e.message || e) } });
      return;
    }

    const { content, toolCalls } = result;
    const assistantMsg = { role: "assistant", content: content || "" };
    if (toolCalls.length) {
      assistantMsg.tool_calls = toolCalls.map((tc) => ({ id: tc.id, type: "function", function: { name: tc.name, arguments: tc.arguments } }));
    }
    history.push(assistantMsg);

    if (!toolCalls.length) {
      // Final answer — reveal the text now (after any tools have actually run).
      if (content) emit({ kind: "assistant_delta", data: { text: content } });
      emit({ kind: "assistant_message", data: { stop_reason: "end_turn" } });
      emit({ kind: "result", data: { subtype: "success", num_turns: step + 1, duration_ms: Date.now() - started } });
      return;
    }
    // Tool-calling step: suppress the model's pre-tool narration so it can't claim
    // success before the user approves. The tool cards convey the action.

    for (const tc of toolCalls) {
      let args = {};
      try { args = JSON.parse(tc.arguments || "{}"); } catch {}

      // Plan mode: refuse mutations outright.
      if (isBlocked(permMode, tc.name)) {
        emit({ kind: "tool_use", data: { id: tc.id, name: tc.name, input: args, auto: false } });
        emit({ kind: "permission_denied", data: { id: tc.id, name: tc.name, reason: "plan mode (read-only)" } });
        const out = "(blocked: plan mode is read-only)";
        emit({ kind: "tool_result", data: { id: tc.id, output: out } });
        history.push({ role: "tool", tool_call_id: tc.id, content: out });
        continue;
      }

      const auto = isAuto(permMode, tc.name);
      emit({ kind: "tool_use", data: { id: tc.id, name: tc.name, input: args, auto } });

      let allowed = auto;
      if (!allowed) allowed = await askPermission(emit, permissions, tc.id, tc.name, args);

      let output;
      if (!allowed) {
        emit({ kind: "permission_denied", data: { id: tc.id, name: tc.name, reason: "declined" } });
        output = "(user declined this tool call)";
      } else {
        try { output = execTool(cwd, tc.name, args); emit({ kind: "tool_result", data: { id: tc.id, output: String(output).slice(0, 4000) } }); }
        catch (e) { output = "ERROR: " + e.message; emit({ kind: "tool_result", data: { id: tc.id, output } }); }
      }
      history.push({ role: "tool", tool_call_id: tc.id, content: String(output).slice(0, 8000) });
    }
  }
  emit({ kind: "result", data: { subtype: "max_steps", duration_ms: Date.now() - started } });
}

module.exports = { runOpenAIAgentTurn };
