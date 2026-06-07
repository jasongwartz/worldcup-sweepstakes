import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: "src/client",
  // .env files live at the project root, not next to the Vite root.
  envDir: "../..",
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      // Must use the regex form so `/api.ts` (a client file) doesn't get
      // shipped to the Hono server — only real `/api/...` paths should.
      "^/api/": "http://localhost:8787",
    },
  },
});
