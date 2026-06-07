import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Hono } from "hono";
import { TournamentTeamsFileSchema } from "../core/schemas.ts";
import { computeLeaderboard } from "../core/scoring.ts";
import { type Team } from "../core/types.ts";
import { authMiddleware } from "./auth.ts";
import { createCache } from "./cache.ts";
import {
  buildOwnersMap,
  enrichLiveMatches,
  getResults,
  groupLiveFixturesByParticipant,
  readResultsConfig,
} from "./results/service.ts";
import { loadSecrets } from "./secrets.ts";

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
    const r = await getResults({ cache, config, teams });
    return c.json({
      lastUpdated: r.lastUpdated,
      degraded: r.degraded,
      refreshed: r.refreshed,
      ...r.bundle,
    });
  });

  app.get("/api/results/fixtures", async (c) => {
    const r = await getResults({ cache, config, teams });
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
    const r = await getResults({ cache, config, teams });
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
    const r = await getResults({ cache, config, teams });
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
    const r = await getResults({ cache, config, teams });
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
    const r = await getResults({ cache, config, teams });
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

function loadTournamentTeams(): Team[] {
  const path = resolve("data/tournament-teams.json");
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  return TournamentTeamsFileSchema.parse(raw).teams;
}
