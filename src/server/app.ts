import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Context, Hono } from "hono";
import { TournamentTeamsFileSchema } from "../core/schemas.js";
import { computeLeaderboard } from "../core/scoring.js";
import { type Team } from "../core/types.js";
import { authMiddleware } from "./auth.js";
import { createCache } from "./cache.js";
import {
  buildOwnersMap,
  enrichLiveMatches,
  getResults,
  groupLiveFixturesByParticipant,
  readResultsConfig,
} from "./results/service.js";
import { loadSecrets } from "./secrets.js";

export function createApp(env: NodeJS.ProcessEnv = process.env): Hono {
  const app = new Hono();
  const cache = createCache(env);
  const config = readResultsConfig(env);
  const teams = loadTournamentTeams();

  // Health check is uncredentialed so platform pingers can hit it.
  app.use("/api/*", authMiddleware(env));

  app.get("/api/health", (c) =>
    c.json({
      ok: true,
      cache: cache.kind,
      source: config.source,
      ttlSeconds: config.ttlSeconds,
      authEnabled: env.APP_PASSKEY ? true : false,
    }),
  );

  app.get("/api/results", async (c) => {
    const r = await getResults({ cache, config, teams, force: wantsForce(c) });
    return c.json({
      lastUpdated: r.lastUpdated,
      degraded: r.degraded,
      refreshed: r.refreshed,
      ...r.bundle,
    });
  });

  app.get("/api/results/fixtures", async (c) => {
    const r = await getResults({ cache, config, teams, force: wantsForce(c) });
    const secrets = loadSecrets(env);
    return c.json({
      lastUpdated: r.lastUpdated,
      source: r.bundle.source,
      degraded: r.degraded,
      fixtures: r.bundle.fixtures,
      owners: buildOwnersMap(secrets.draws),
    });
  });

  app.get("/api/results/standings", async (c) => {
    const r = await getResults({ cache, config, teams, force: wantsForce(c) });
    const secrets = loadSecrets(env);
    return c.json({
      lastUpdated: r.lastUpdated,
      source: r.bundle.source,
      degraded: r.degraded,
      standings: r.bundle.standings,
      owners: buildOwnersMap(secrets.draws),
    });
  });

  app.get("/api/results/live", async (c) => {
    const r = await getResults({ cache, config, teams, force: wantsForce(c) });
    const secrets = loadSecrets(env);
    const matches = enrichLiveMatches(r.bundle.fixtures, secrets.draws);
    return c.json({
      lastUpdated: r.lastUpdated,
      source: r.bundle.source,
      degraded: r.degraded,
      matches,
    });
  });

  app.get("/api/results/leaderboard", async (c) => {
    const r = await getResults({ cache, config, teams, force: wantsForce(c) });
    const secrets = loadSecrets(env);
    const leaderboard = computeLeaderboard({
      fixtures: r.bundle.fixtures,
      standings: r.bundle.standings,
      draws: secrets.draws,
      asOf: r.lastUpdated,
    });
    return c.json({
      lastUpdated: r.lastUpdated,
      source: r.bundle.source,
      degraded: r.degraded,
      leaderboard,
    });
  });

  app.get("/api/results/live-by-participant", async (c) => {
    const r = await getResults({ cache, config, teams, force: wantsForce(c) });
    const secrets = loadSecrets(env);
    const grouped = groupLiveFixturesByParticipant(
      r.bundle.fixtures,
      secrets.draws,
    );
    return c.json({
      lastUpdated: r.lastUpdated,
      source: r.bundle.source,
      degraded: r.degraded,
      groups: grouped,
    });
  });

  return app;
}

/** Truthy `?forceUpdate=` query param — bypasses the results cache gates. */
function wantsForce(c: Context): boolean {
  const raw = c.req.query("forceUpdate");
  return raw === "1" || raw?.toLowerCase() === "true";
}

function loadTournamentTeams(): Team[] {
  const path = resolve("data/tournament-teams.json");
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  return TournamentTeamsFileSchema.parse(raw).teams;
}
