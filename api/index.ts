import { getRequestListener } from "@hono/node-server";
import { createApp } from "../src/server/app.js";

/**
 * We run on the Node runtime (not Edge) because the server reads
 * `data/tournament-teams.json` via fs at boot. `hono/vercel`'s `handle()` is
 * shaped for Edge (Request → Response); on Node we need a classic
 * `(req, res) => void` listener, which `@hono/node-server` provides.
 */
export const config = { runtime: "nodejs" };

export default getRequestListener(createApp().fetch);
