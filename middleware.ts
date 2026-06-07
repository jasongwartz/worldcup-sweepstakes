/**
 * Vercel Edge middleware — gates every request behind a shared passkey.
 * Logic lives in `src/auth/shared.ts`; this file just translates Web Request
 * / Response shapes to/from `evaluateAuth()`.
 */

import {
  buildCookie,
  evaluateAuth,
  isPublicPath,
  LOCKED_HTML,
  parseCookieHeader,
} from "./src/auth/shared";

export const config = {
  // Match everything (HTML, JS, CSS, API). The shared logic exempts public
  // paths like `/api/health` so platform pingers can still hit them.
  matcher: "/:path*",
};

export default function middleware(request: Request): Response | undefined {
  const passkey = process.env.APP_PASSKEY?.trim();
  if (!passkey) return undefined;

  const url = new URL(request.url);
  if (isPublicPath(url.pathname)) return undefined;

  const decision = evaluateAuth({
    pathname: url.pathname,
    searchParams: url.searchParams,
    cookies: parseCookieHeader(request.headers.get("cookie") ?? ""),
    passkey,
  });

  switch (decision.type) {
    case "pass":
      return undefined;
    case "redirect": {
      const headers = new Headers({ location: decision.location });
      headers.append(
        "set-cookie",
        buildCookie(decision.cookieValue, { secure: true }),
      );
      return new Response(null, { status: 302, headers });
    }
    case "deny":
      return new Response(LOCKED_HTML, {
        status: 401,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
  }
}
