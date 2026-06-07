# World Cup Sweepstakes

Group sweepstakes leaderboard for the 2026 FIFA World Cup. Each participant
gets a few teams in a draw; the site shows live matches grouped by participant,
group standings, and the full fixture list — refreshed automatically during
live match windows.

## Architecture

```
┌──────────────┐         ┌─────────────────────────────────────┐
│ Vite + React │ ◀────── │ Hono on Vercel                      │
│ TanStack Q.  │  /api   │  /api/results/fixtures              │
└──────────────┘         │  /api/results/standings             │
                         │  /api/results/live                  │
                         │  /api/results/live-by-participant   │
                         └────────────┬────────────────────────┘
                                      │  SWR cache (TTL + live-window gating)
                                      ▼
                              Upstash Redis (prod) / local file (dev)
                                      ▲
                                      │ on-demand refresh
                         ┌────────────┴───────────┐
                         │     ResultsSource      │  ← single interface,
                         │  (swappable adapter)   │     scoring/frontend
                         └────────────┬───────────┘     never depend on
                                      │                 the upstream API
              ┌───────────────────────┼───────────────────────┐
              ▼                       ▼                       ▼
        openfootball            API-Football                 demo
        (keyless, lags)         (paid plan req'd 2026)       (synthetic, dev only)
```

- **`src/core/`** — domain types, Zod schemas, scoring. Pure, no I/O.
- **`src/server/`** — Hono app, SWR cache, source adapters.
- **`src/server/results/`** — `ResultsSource` interface + adapters. Add a new
  file per upstream API and register it in `source.ts`.
- **`src/client/`** — Vite SPA, three TanStack Query streams.
- **`scripts/`** — reproducible CLIs (draw + secret management).

The fetcher is intentionally isolated from the website: every adapter
normalizes its upstream into our `Fixture` and `GroupStanding` shapes
(`src/core/types.ts`). The cache, routes, and downstream scoring depend
only on those — swapping providers never touches anything else.

## Results sources

| `RESULTS_SOURCE` | Behavior |
| --- | --- |
| `openfootball` (default) | Keyless. Fetches `openfootball/worldcup.json` for 2026. Authoritative for structure (104 fixtures, 12 groups, kickoffs, venues). Results lag — community-maintained via PRs, **not safe for live scoring**. Standings are derived from finished fixtures. |
| `api-football` | Primary source for live scores. Requires `API_FOOTBALL_KEY` from api-sports.io. **Free plan does not cover season 2026** — Pro plan ($19/mo) or higher required. Falls back to openfootball if the key is missing. |
| `demo` | Dev-only. Wraps openfootball with synthetic scores and a couple of "live" matches so the UI has something to show before the tournament starts. |

`RESULTS_TTL_SECONDS` (default 120) controls cache freshness. Outside live
match windows the cache is served stale — no upstream call. Inside a live
window (any fixture currently in progress or kicking off within the next
30 minutes / last 4 hours) the cache re-fetches on demand. If the upstream
fails, the last good bundle keeps serving and the response carries
`degraded: true`.

## Local setup

```sh
npm install
cp .env.example .env.local
# create your local secrets:
cat > teams.yaml <<'EOF'
teams:
  - Alice
  - Bob
EOF
npm run draw                        # writes draw.yaml
# Edit .env.local: set TEAMS_YAML and DRAW_YAML inline,
# RESULTS_SOURCE=demo for a richer dev experience.
npm run dev                         # http://localhost:5173
```

Vite serves the SPA on :5173 and proxies `/api/*` to the Hono dev server
on :8787. With no `KV_REST_API_URL` set, the server caches to a local
`.cache.local.json` instead of Upstash.

## Reproducible scripts

| Command | What it does |
| --- | --- |
| `npm run draw -- [--seed X] [--out path]` | Shuffle teams across participants, write `draw.yaml`. Same seed → same result. |
| `npm run push-secrets` | Push `teams.yaml`, `draw.yaml`, and `$PROVIDER_API_KEY` to Vercel (all 3 environments). |

All scripts are non-interactive — safe to run from CI or a Makefile.
Requires `vercel login` + `vercel link` once per machine.

## Deploy

1. **Tournament teams** are auto-generated from openfootball/worldcup.json
   by `scripts/seed-teams.ts`, which runs on `prebuild` and `predev`. The
   resulting `data/tournament-teams.json` is gitignored — never edit by hand.
   Vercel includes `data/**` in the function bundle via `vercel.json`.
2. **Create an Upstash Redis database** (sign up at upstash.com, free tier).
   Copy the REST URL + token into Vercel env as `KV_REST_API_URL` and
   `KV_REST_API_TOKEN`.
3. **Configure the source** in Vercel env:
   - `RESULTS_SOURCE=openfootball` to start, or
   - `RESULTS_SOURCE=api-football` + `API_FOOTBALL_KEY=...` if you've paid for
     api-sports.io access.
4. **Run the draw locally** (`npm run draw`).
5. **Push secrets**:
   ```sh
   API_FOOTBALL_KEY=... npm run push-secrets   # if using api-football
   ```
6. **Deploy**: `vercel deploy --prod`.

## Swapping the results source

Add a new file under `src/server/results/`:

```ts
// src/server/results/my-new-source.ts
import { type ResultsSource } from "./types.ts";

export function myNewSource(opts: { apiKey: string }): ResultsSource {
  return {
    name: "api-football",  // or extend ResultsSourceName
    async getFixtures({ teams }) { /* normalize into Fixture[] */ },
    async getStandings({ teams }) { /* normalize into GroupStanding[] */ },
  };
}
```

Then wire it into `selectResultsSource` in `src/server/results/source.ts`.
Nothing else changes.

## Endpoints

| Path | Returns |
| --- | --- |
| `GET /api/health` | Configured source + cache type + TTL |
| `GET /api/results` | Full bundle: `{ fixtures, standings, source, fetchedAt, degraded }` |
| `GET /api/results/fixtures` | All 104 fixtures, normalized + status |
| `GET /api/results/standings` | All 12 group standings |
| `GET /api/results/live` | Fixtures currently in progress |
| `GET /api/results/live-by-participant` | Live fixtures grouped by which participant drew the teams |

Every response includes `lastUpdated` and `degraded` so the client can
show freshness.
