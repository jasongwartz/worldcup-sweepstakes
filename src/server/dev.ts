import { serve } from "@hono/node-server";
import { resolve } from "node:path";
import { createApp } from "./app.ts";

// Load .env.local before reading any env vars. Built into Node 20.6+.
try {
  process.loadEnvFile(resolve(".env.local"));
} catch (err) {
  if (
    !(err instanceof Error) ||
    !("code" in err) ||
    (err as NodeJS.ErrnoException).code !== "ENOENT"
  ) {
    throw err;
  }
}

const port = Number(process.env.PORT ?? 8787);
const app = createApp();

serve({ fetch: app.fetch, port }, ({ port: actual }) => {
  process.stdout.write(`api: http://localhost:${String(actual)}\n`);
});
