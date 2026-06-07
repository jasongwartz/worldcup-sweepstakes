/**
 * Shared auth decision logic. Pure, Web-API only (no Node imports), so it
 * can run in the Vercel Edge middleware, the Hono server, and the Vite dev
 * plugin without divergence.
 *
 * The three adapters (`middleware.ts`, `src/server/auth.ts`,
 * `authPlugin` in `vite.config.ts`) wire their own request/response shapes
 * around `evaluateAuth()` and reuse `buildCookie` / `LOCKED_HTML`.
 */

export const COOKIE_NAME = "wc_auth";
export const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export type AuthDecision =
  | { type: "pass" }
  | { type: "redirect"; cookieValue: string; location: string }
  | { type: "deny" };

/**
 * Decide what to do with a request.
 *
 *   - cookie matches passkey         → pass
 *   - `?key=<passkey>` present       → redirect to clean URL, set cookie
 *   - otherwise                      → deny (caller renders LOCKED_HTML)
 */
export function evaluateAuth(opts: {
  pathname: string;
  searchParams: URLSearchParams;
  cookies: Record<string, string>;
  passkey: string;
}): AuthDecision {
  if (opts.cookies[COOKIE_NAME] === opts.passkey) {
    return { type: "pass" };
  }

  const provided = opts.searchParams.get("key");
  if (provided === opts.passkey) {
    const stripped = new URLSearchParams(opts.searchParams);
    stripped.delete("key");
    const search = stripped.toString();
    return {
      type: "redirect",
      cookieValue: opts.passkey,
      location: opts.pathname + (search ? `?${search}` : ""),
    };
  }

  return { type: "deny" };
}

export function buildCookie(value: string, opts: { secure: boolean }): string {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    `Max-Age=${String(ONE_YEAR_SECONDS)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
  ];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

export function parseCookieHeader(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const k = trimmed.slice(0, eq);
    if (!k) continue;
    out[k] = decodeURIComponent(trimmed.slice(eq + 1));
  }
  return out;
}

/** True for /api/health and similar paths that should bypass auth. */
export function isPublicPath(pathname: string): boolean {
  return pathname === "/api/health";
}

export const LOCKED_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Locked</title>
    <style>
      :root { color-scheme: dark; }
      body {
        background: #0a0908;
        color: #f6f1e8;
        font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif;
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
      }
      .wrap { text-align: center; padding: 2rem; max-width: 28rem; }
      h1 {
        font-family: "Iowan Old Style", "Apple Garamond", Georgia, serif;
        font-style: italic;
        font-weight: 400;
        font-size: 2.75rem;
        margin: 0 0 1rem;
        letter-spacing: -0.015em;
      }
      p { color: #b3aba0; line-height: 1.6; margin: 0; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>Locked</h1>
      <p>Ask the group owner for the link.</p>
    </div>
  </body>
</html>`;
