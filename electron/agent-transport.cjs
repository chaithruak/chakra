// Agent transport — drives the Claude Agent SDK for Cowork/Code modes.
// The SDK is ESM-only, so we dynamic-import() it from this CJS module.
// It speaks the Anthropic wire format, so the active profile MUST be anthropic-kind
// (Anthropic direct, or a proxy like LiteLLM / free-claude-code in front of any model).

let _sdk = null;
async function getSdk() {
  if (!_sdk) _sdk = await import("@anthropic-ai/claude-agent-sdk");
  return _sdk;
}

const COWORK_ADDENDUM =
  "You are operating in Cowork mode over the user's selected folder. Prefer making concrete " +
  "edits to files directly. Keep explanations short.";

function buildOptions(mode, cwd, profile, canUseTool, permMode) {
  return {
    cwd,
    model: profile.model,
    includePartialMessages: true,
    canUseTool,
    systemPrompt: mode === "cowork"
      ? { type: "preset", preset: "claude_code", append: COWORK_ADDENDUM }
      : { type: "preset", preset: "claude_code" },
    settingSources: mode === "cowork" ? ["project", "local"] : ["project"],
    permissionMode: permMode || "default",   // user-selected: default | acceptEdits | bypassPermissions | plan
    allowedTools: ["Read", "Grep", "Glob"],  // reads auto-approved; rest honors permissionMode/canUseTool
  };
}

// Export the active profile to the env the bundled Claude Code binary reads.
function applyEnv(profile) {
  if (profile.kind !== "anthropic") return false;
  let useSubscription = false;
  try { useSubscription = !!require("./settings.cjs").load().anthropicUseSubscription; } catch {}

  if (useSubscription) {
    // Subscription mode: bill the user's Claude plan (Agent-SDK credit pool) via the
    // OAuth creds stored by `claude login` (~/.claude). The bundled binary uses those
    // ONLY when no API key is present, so we must strip any key from the env.
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    process.env.ANTHROPIC_BASE_URL = "https://api.anthropic.com";
    return true;
  }

  if (profile.baseUrl) process.env.ANTHROPIC_BASE_URL = profile.baseUrl.replace(/\/$/, "");
  if (profile.apiKey) {
    process.env.ANTHROPIC_AUTH_TOKEN = profile.apiKey;
    process.env.ANTHROPIC_API_KEY = profile.apiKey;
  }
  return true;
}

// SDKMessage → zero or more normalized UiEvents (kind/data only; caller adds seq).
function toUiEvents(msg) {
  const out = [];
  switch (msg.type) {
    case "system":
      if (msg.subtype === "init")
        out.push({ kind: "init", data: { model: msg.model, cwd: msg.cwd, permissionMode: msg.permissionMode, tools: msg.tools } });
      break;
    case "stream_event": {
      const ev = msg.event;
      if (ev && ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta")
        out.push({ kind: "assistant_delta", data: { text: ev.delta.text } });
      break;
    }
    case "assistant": {
      const content = (msg.message && msg.message.content) || [];
      for (const b of content) {
        if (b.type === "tool_use") out.push({ kind: "tool_use", data: { id: b.id, name: b.name, input: b.input } });
      }
      out.push({ kind: "assistant_message", data: { stop_reason: msg.message && msg.message.stop_reason } });
      break;
    }
    case "user": {
      const content = (msg.message && msg.message.content) || [];
      for (const b of content) {
        if (b.type === "tool_result") {
          const text = Array.isArray(b.content) ? b.content.map((c) => c.text || "").join("") : (b.content || "");
          out.push({ kind: "tool_result", data: { id: b.tool_use_id, output: String(text).slice(0, 4000) } });
        }
      }
      break;
    }
    case "result":
      if (msg.is_error || (msg.subtype && msg.subtype !== "success"))
        out.push({ kind: "error", data: { code: msg.subtype || "error", message: `Agent ended: ${msg.subtype || "error"}` } });
      else
        out.push({ kind: "result", data: { subtype: msg.subtype, num_turns: msg.num_turns, duration_ms: msg.duration_ms, total_cost_usd: msg.total_cost_usd } });
      break;
    default:
      break;
  }
  return out;
}

/**
 * Run one agent turn.
 * @returns {Promise<string|null>} the SDK session_id (for resume on the next turn)
 */
async function runAgentTurn({ prompt, mode, cwd, profile, resume, emit, permissions, holds, sessionId, permMode }) {
  if (!applyEnv(profile)) {
    emit({ kind: "error", data: { code: "wrong_profile", message: `Cowork needs an Anthropic-compatible provider. "${profile.name}" is ${profile.kind}. Select an Anthropic profile (Anthropic direct, or a LiteLLM/free-claude-code proxy) in Settings.` } });
    return resume || null;
  }

  let query;
  try {
    ({ query } = await getSdk());
  } catch (e) {
    emit({ kind: "error", data: { code: "sdk_missing", message: "Claude Agent SDK not installed/loadable. Run: npm install @anthropic-ai/claude-agent-sdk@latest  (" + String(e.message || e) + ")" } });
    return resume || null;
  }

  const canUseTool = (toolName, input) =>
    new Promise((resolve) => {
      const requestId = "perm_" + Math.random().toString(36).slice(2, 9);
      permissions.set(requestId, resolve);
      emit({ kind: "permission_request", data: { requestId, toolName, input } });
    });

  const options = buildOptions(mode, cwd, profile, canUseTool, permMode);
  if (resume) options.resume = resume;

  let sdkSessionId = resume || null;
  try {
    const q = query({ prompt, options });
    holds.set(sessionId, q);
    for await (const msg of q) {
      if (msg.session_id) sdkSessionId = msg.session_id;
      for (const e of toUiEvents(msg)) emit(e);
    }
  } catch (e) {
    emit({ kind: "error", data: { code: "agent_error", message: String((e && e.message) || e) } });
  } finally {
    holds.delete(sessionId);
  }
  return sdkSessionId;
}

module.exports = { runAgentTurn };
