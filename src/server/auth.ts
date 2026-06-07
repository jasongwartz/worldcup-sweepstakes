import { type Context, type MiddlewareHandler } from "hono";
import {
  buildCookie,
  COOKIE_NAME,
  evaluateAuth,
  isPublicPath,
  parseCookieHeader,
} from "../auth/shared";

/**
 * Hono-side gate so `npm run dev:server` mimics production for direct API
 * calls. Vite's dev plugin (`authPlugin` in `vite.config.ts`) handles the
 * SPA entry; this file handles the /api/* layer. Both delegate to the same
 * decision logic in `src/auth/shared.ts`.
 */
export function authMiddleware(env: NodeJS.ProcessEnv): MiddlewareHandler {
  const passkey = env.APP_PASSKEY?.trim();
  if (!passkey) {
    return async (_c, next) => {
      await next();
    };
  }

  return async (c, next) => {
    const url = new URL(c.req.url);
    if (isPublicPath(url.pathname)) {
      await next();
      return;
    }

    const decision = evaluateAuth({
      pathname: url.pathname,
      searchParams: url.searchParams,
      cookies: parseCookieHeader(c.req.header("cookie") ?? ""),
      passkey,
    });

    switch (decision.type) {
      case "pass":
        await next();
        return;
      case "redirect":
        c.header(
          "set-cookie",
          buildCookie(decision.cookieValue, { secure: isSecure(c) }),
        );
        // For an API hit the caller is curl/fetch, not a browser — keep
        // serving the response inline rather than 302'ing.
        await next();
        return;
      case "deny":
        return c.json({ error: "locked — ask the group owner for the link" }, 401);
    }
  };
}

/** Re-exported for tests and any code that wants to read the cookie. */
export { COOKIE_NAME };

function isSecure(c: Context): boolean {
  return (
    c.req.url.startsWith("https://") ||
    c.req.header("x-forwarded-proto") === "https"
  );
}
