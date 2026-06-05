// Chat transport: stream from OpenAI- or Anthropic-compatible endpoints.
// Node 18+/Electron has global fetch + ReadableStream. No deps.

async function* sseLines(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line.startsWith("data:")) yield line.slice(5).trim();
    }
  }
}

async function ensureOk(res, provider) {
  if (res.ok) return;
  let detail = "";
  try { detail = (await res.text()).slice(0, 400); } catch {}
  const err = new Error(`${provider} ${res.status}: ${detail || res.statusText}`);
  err.code = res.status === 429 ? "rate_limit" : res.status === 401 ? "auth" : "http_error";
  throw err;
}

// OpenAI-compatible: POST {baseUrl}/v1/chat/completions
async function streamOpenAI(profile, messages, { onDelta, signal }) {
  const url = profile.baseUrl.replace(/\/$/, "") + "/v1/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(profile.apiKey ? { Authorization: `Bearer ${profile.apiKey}` } : {}),
    },
    body: JSON.stringify({ model: profile.model, messages, stream: true }),
  });
  await ensureOk(res, "OpenAI-compatible");

  let text = "";
  for await (const data of sseLines(res)) {
    if (data === "[DONE]") break;
    let json; try { json = JSON.parse(data); } catch { continue; }
    const delta = json.choices?.[0]?.delta?.content;
    if (delta) { text += delta; onDelta(delta); }
  }
  return { text };
}

// Anthropic-compatible: POST {baseUrl}/v1/messages (works for the free-cc proxy too)
async function streamAnthropic(profile, messages, { onDelta, signal }) {
  const url = profile.baseUrl.replace(/\/$/, "") + "/v1/messages";
  // Anthropic wants system separate from the turn list.
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n") || undefined;
  const turns = messages.filter((m) => m.role !== "system");
  const res = await fetch(url, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      ...(profile.apiKey ? { "x-api-key": profile.apiKey, Authorization: `Bearer ${profile.apiKey}` } : {}),
    },
    body: JSON.stringify({ model: profile.model, max_tokens: 4096, system, messages: turns, stream: true }),
  });
  await ensureOk(res, "Anthropic-compatible");

  let text = "";
  for await (const data of sseLines(res)) {
    let json; try { json = JSON.parse(data); } catch { continue; }
    if (json.type === "content_block_delta" && json.delta?.type === "text_delta") {
      text += json.delta.text; onDelta(json.delta.text);
    }
    if (json.type === "message_stop") break;
  }
  return { text };
}

function streamChat(profile, messages, opts) {
  return profile.kind === "anthropic"
    ? streamAnthropic(profile, messages, opts)
    : streamOpenAI(profile, messages, opts);
}

// List models from the provider's /v1/models (best-effort).
async function listModels(profile) {
  if (!profile || !profile.baseUrl) return [];
  const url = profile.baseUrl.replace(/\/$/, "") + "/v1/models";
  const headers = {};
  if (profile.kind === "anthropic") {
    headers["anthropic-version"] = "2023-06-01";
    if (profile.apiKey) headers["x-api-key"] = profile.apiKey;
  } else if (profile.apiKey) {
    headers["Authorization"] = `Bearer ${profile.apiKey}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) return [];
  const json = await res.json();
  const rows = json.data || json.models || json || [];
  return rows
    .map((m) => (typeof m === "string" ? m : m.id || m.name))
    .filter(Boolean)
    .sort();
}

// OpenAI-compatible streaming WITH tools — streams text deltas and accumulates tool_calls.
async function streamChatTools(profile, messages, tools, { onDelta, signal }) {
  const url = profile.baseUrl.replace(/\/$/, "") + "/v1/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(profile.apiKey ? { Authorization: `Bearer ${profile.apiKey}` } : {}),
    },
    body: JSON.stringify({ model: profile.model, messages, tools, tool_choice: "auto", stream: true }),
  });
  await ensureOk(res, "OpenAI-compatible");

  let content = "";
  const calls = {}; // index -> { id, name, arguments }
  for await (const data of sseLines(res)) {
    if (data === "[DONE]") break;
    let json; try { json = JSON.parse(data); } catch { continue; }
    const delta = json.choices && json.choices[0] && json.choices[0].delta;
    if (!delta) continue;
    if (delta.content) { content += delta.content; onDelta(delta.content); }
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const i = tc.index != null ? tc.index : 0;
        calls[i] = calls[i] || { id: "", name: "", arguments: "" };
        if (tc.id) calls[i].id = tc.id;
        if (tc.function && tc.function.name) calls[i].name += tc.function.name;
        if (tc.function && tc.function.arguments) calls[i].arguments += tc.function.arguments;
      }
    }
  }
  const toolCalls = Object.values(calls).filter((c) => c.name);
  toolCalls.forEach((c, i) => { if (!c.id) c.id = "call_" + i + "_" + Math.random().toString(36).slice(2, 7); });
  return { content, toolCalls };
}

module.exports = { streamChat, streamChatTools, listModels };
