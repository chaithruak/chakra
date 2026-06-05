// Picks the real Electron bridge (window.chai) when running in the desktop app,
// otherwise the in-browser mock. The UI imports ONLY from here.
import { mockBridge } from "./mockBridge.js";

const real = typeof window !== "undefined" ? window.chai : null;

export const bridge = real || mockBridge;
export const isReal = Boolean(real);
