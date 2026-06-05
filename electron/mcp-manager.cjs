// MCP manager — connects to stdio MCP servers, exposes their tools to the agent
// loop as OpenAI function schemas, and routes tool calls back to the right server.
// The MCP SDK is ESM, so we dynamic-import() it from this CJS module.

let _mod = null;
async function sdk() {
  if (!_mod) {
    const client = await import("@modelcontextprotocol/sdk/client/index.js");
    const stdio = await import("@modelcontextprotocol/sdk/client/stdio.js");
    _mod = { Client: client.Client, StdioClientTransport: stdio.StdioClientTransport };
  }
  return _mod;
}

const clients = new Map();   // serverId -> { client, tools }
const route = new Map();     // openai-fn-name -> { serverId, toolName }

const sanitize = (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, "_");
const fnName = (serverId, toolName) => `mcp__${sanitize(serverId)}__${sanitize(toolName)}`.slice(0, 64);

async function connect(server) {
  if (clients.has(server.id)) return clients.get(server.id);
  const { Client, StdioClientTransport } = await sdk();
  const transport = new StdioClientTransport({
    command: server.command,
    args: server.args || [],
    env: { ...process.env, ...(server.env || {}) },
  });
  const client = new Client({ name: "chakra", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  const listed = await client.listTools();
  const entry = { client, tools: listed.tools || [] };
  clients.set(server.id, entry);
  return entry;
}

// Return all enabled connectors' tools as OpenAI function schemas (+ populate the route map).
async function openAiTools(connectors) {
  const out = [];
  route.clear();
  for (const s of connectors || []) {
    if (!s.enabled) continue;
    let entry;
    try { entry = await connect(s); } catch { continue; }
    for (const t of entry.tools) {
      const name = fnName(s.id, t.name);
      route.set(name, { serverId: s.id, toolName: t.name });
      out.push({
        type: "function",
        function: {
          name,
          description: (t.description || `${t.name} via ${s.name}`).slice(0, 1024),
          parameters: t.inputSchema && t.inputSchema.type ? t.inputSchema : { type: "object", properties: {} },
        },
      });
    }
  }
  return out;
}

const isMcpTool = (name) => typeof name === "string" && name.startsWith("mcp__");

async function callTool(fnName_, args) {
  const r = route.get(fnName_);
  if (!r) return "ERROR: unknown MCP tool " + fnName_;
  const entry = clients.get(r.serverId);
  if (!entry) return "ERROR: MCP server not connected";
  const res = await entry.client.callTool({ name: r.toolName, arguments: args || {} });
  const parts = (res.content || []).map((c) => (c.type === "text" ? c.text : JSON.stringify(c)));
  return parts.join("\n").slice(0, 8000) || "(no output)";
}

// Try connecting and listing tools — used by the Connectors UI "Test" button.
async function testServer(server) {
  try {
    // force a fresh connection for the test
    if (clients.has(server.id)) { try { await clients.get(server.id).client.close(); } catch {} clients.delete(server.id); }
    const entry = await connect(server);
    return { ok: true, tools: entry.tools.map((t) => t.name) };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

async function disconnectAll() {
  for (const { client } of clients.values()) { try { await client.close(); } catch {} }
  clients.clear();
}

module.exports = { openAiTools, isMcpTool, callTool, testServer, disconnectAll };
