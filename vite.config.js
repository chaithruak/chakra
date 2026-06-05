import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" so the build works when loaded from Electron's file:// later.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { port: 5174, strictPort: true },
});
