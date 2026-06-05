// Chai ⇄ SessionManager IPC contract (mirrors ARCHITECTURE.md §4).
// This file is the single source of truth the renderer codes against. In the
// real app, an Electron preload exposes `window.chai` implementing `Bridge`.
// Here, mockBridge.js implements the same shape so the UI runs in a browser.

/**
 * @typedef {"chat"|"code"|"cowork"|"project"} Mode
 *
 * Normalized event the main process streams to the renderer.
 * @typedef {Object} UiEvent
 * @property {string} sessionId
 * @property {number} seq
 * @property {"init"|"assistant_delta"|"assistant_message"|"tool_use"|"tool_result"
 *   |"permission_request"|"permission_denied"|"result"|"error"} kind
 * @property {any} data
 *
 * Commands the renderer sends to the main process.
 * @typedef {Object} Bridge
 * @property {(req: StartSessionRequest) => Promise<{sessionId: string}>} start
 * @property {(sessionId: string, text: string) => Promise<void>} sendInput
 * @property {(sessionId: string) => Promise<void>} interrupt
 * @property {(sessionId: string, mode: string) => Promise<void>} setPermissionMode
 * @property {(requestId: string, result: PermissionResult) => void} resolvePermission
 * @property {(cb: (e: UiEvent) => void) => () => void} onEvent  // returns unsubscribe
 *
 * @typedef {Object} StartSessionRequest
 * @property {Mode} mode
 * @property {string} prompt
 * @property {string} [cwd]
 * @property {string} [model]
 *
 * SDK PermissionResult (verbatim from the Agent SDK).
 * @typedef {{behavior:"allow", updatedInput?:Object}
 *   | {behavior:"deny", message?:string, interrupt?:boolean}} PermissionResult
 */

export const MODES = [
  { id: "chat",    label: "Chat",        sub: "Stateless · direct to proxy" },
  { id: "code",    label: "Claude Code", sub: "Repo tools · ask before write" },
  { id: "cowork",  label: "Cowork",      sub: "Folder · skills · connectors" },
  { id: "project", label: "Projects",    sub: "Saved sessions" },
];

export const SECONDARY = [
  { id: "skills",     label: "Skills" },
  { id: "connectors", label: "Connectors" },
  { id: "settings",   label: "Settings" },
];

// Demonstration model catalog (real app reads proxy GET /v1/models).
export const MODELS = [
  { group: "Anthropic (direct)", items: [
    { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", prov: "anthropic", badge: "best agentic" },
    { id: "claude-haiku-4-5",  name: "Claude Haiku 4.5",  prov: "anthropic", badge: "fast" },
  ]},
  { group: "OpenRouter / DeepSeek", items: [
    { id: "deepseek/deepseek-v3", name: "DeepSeek V3", prov: "openrouter", badge: "cheap" },
    { id: "deepseek/deepseek-r1", name: "DeepSeek R1", prov: "openrouter", badge: "reasoning" },
    { id: "moonshotai/kimi-k2",   name: "Kimi K2",     prov: "openrouter", badge: "agentic" },
    { id: "z-ai/glm-4.6",         name: "GLM 4.6",     prov: "openrouter" },
  ]},
  { group: "Local", items: [
    { id: "lmstudio/qwen3-coder", name: "Qwen3 Coder (LM Studio)", prov: "local", badge: "offline" },
  ]},
];
