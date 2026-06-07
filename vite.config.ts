import { type Connect, defineConfig, loadEnv, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import {
  buildCookie,
  evaluateAuth,
  isPublicPath,
  LOCKED_HTML,
  parseCookieHeader,
} from "./src/auth/shared.ts";

/**
 * Dev-only mirror of `middleware.ts` (the Vercel Edge gate). Lets us test the
 * full URL-key → cookie → clean-URL flow locally without `vercel dev`.
 * Decision logic lives in `src/auth/shared.ts`; this just adapts Node's
 * Connect req/res shape.
 */
function authPlugin(passkey: string): PluginOption {
  if (!passkey) return null;

  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (isPublicPath(url.pathname)) {
      next();
      return;
    }

    const decision = evaluateAuth({
      pathname: url.pathname,
      searchParams: url.searchParams,
      cookies: parseCookieHeader(req.headers.cookie ?? ""),
      passkey,
    });

    switch (decision.type) {
      case "pass":
        next();
        return;
      case "redirect":
        // Local dev is HTTP; the cookie can't be Secure or browsers drop it.
        res.statusCode = 302;
        res.setHeader(
          "Set-Cookie",
          buildCookie(decision.cookieValue, { secure: false }),
        );
        res.setHeader("Location", decision.location);
        res.end();
        return;
      case "deny":
        res.statusCode = 401;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(LOCKED_HTML);
        return;
    }
  };

  return {
    name: "wc-auth",
    configureServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig(({ mode }) => {
  // Surface APP_PASSKEY to the Node-side Vite config; client code still only
  // sees VITE_-prefixed env via import.meta.env.
  const env = loadEnv(mode, process.cwd(), ["VITE_", "APP_"]);
  const passkey = env.APP_PASSKEY?.trim() ?? "";

  return {
    plugins: [react(), authPlugin(passkey)],
    root: "src/client",
    envDir: "../..",
    build: {
      outDir: "../../dist",
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      proxy: {
        // Regex form so `/api.ts` (a client file) doesn't get shipped to the
        // Hono server — only real `/api/...` paths should.
        "^/api/": "http://localhost:8787",
      },
    },
  };
});
