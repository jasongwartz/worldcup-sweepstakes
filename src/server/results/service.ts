import {
  type Fixture,
  type LiveFixturesByParticipant,
  type LiveMatch,
  type ParticipantDraw,
  type ResultsBundle,
  type Team,
} from "../../core/types.js";
import { type Cache, type CacheEntry } from "../cache.js";
import { isInLiveWindow, pickLiveFixtures } from "./live-window.js";
import {
  readResultsConfig,
  selectResultsSource,
  type ResultsConfig,
} from "./source.js";

const CACHE_KEY = "wc:results:v1";

export interface ResultsServiceDeps {
  cache: Cache;
  config: ResultsConfig;
  teams: readonly Team[];
  /**
   * Bypass the TTL and live-window gates and pull from upstream now. Used by
   * the client's manual refresh. On upstream failure we still fall back to the
   * cached bundle (flagged degraded) rather than erroring.
   */
  force?: boolean;
}

export interface ResultsResponse {
  bundle: ResultsBundle;
  lastUpdated: string;
  /** True if we re-fetched on this read; false if served from cache. */
  refreshed: boolean;
  /** True if the upstream fetch failed and we're serving stale data. */
  degraded: boolean;
}

/**
 * Read-through SWR cache around a ResultsSource.
 *
 *   - Empty cache               → fetch (blocking)
 *   - Fresh cache (< TTL)       → serve cached
 *   - Stale + not in live window → serve cached (no upstream call)
 *   - Stale + in live window    → fetch; on failure serve cached + flag degraded
 *
 * "Live window" is computed from the *cached* fixtures, so refreshes only
 * happen around real matches. This self-rate-limits regardless of source.
 *
 * A `force` request bypasses both gates and always pulls upstream.
 */
export async function getResults(
  deps: ResultsServiceDeps,
): Promise<ResultsResponse> {
  const { cache, config, force = false } = deps;
  const cached = await cache.get<ResultsBundle>(CACHE_KEY);
  const now = new Date();

  // Serve cached without an upstream call when it's still fresh, or stale but
  // outside the live window. `force` skips both checks.
  if (cached && !force) {
    const ageMs = now.getTime() - Date.parse(cached.lastUpdated);
    const ttlMs = config.ttlSeconds * 1000;
    if (ageMs < ttlMs) {
      return toResponse(cached, false, false);
    }
    if (!isInLiveWindow(cached.data.fixtures, now)) {
      return toResponse(cached, false, false);
    }
  }

  // Reached when there's no cache, a forced refresh, or a stale bundle inside
  // the live window — all cases that warrant an upstream pull.
  const fresh = await tryFetch(deps);
  if (fresh.ok) {
    await cache.set(CACHE_KEY, {
      data: fresh.bundle,
      lastUpdated: fresh.bundle.fetchedAt,
    });
    return {
      bundle: fresh.bundle,
      lastUpdated: fresh.bundle.fetchedAt,
      refreshed: true,
      degraded: false,
    };
  }

  // Upstream failed: keep serving the last good bundle if we have one.
  if (cached) {
    process.stderr.write(
      `results refresh failed, serving cached: ${String(fresh.error)}\n`,
    );
    return toResponse(cached, false, true);
  }
  throw fresh.error;
}

type FetchOutcome =
  | { ok: true; bundle: ResultsBundle }
  | { ok: false; error: unknown };

async function tryFetch(deps: ResultsServiceDeps): Promise<FetchOutcome> {
  try {
    const source = selectResultsSource(deps.config);
    const [fixtures, standings] = await Promise.all([
      source.getFixtures({ teams: deps.teams }),
      source.getStandings({ teams: deps.teams }),
    ]);
    // Upsert by id — preserve fixture order from upstream (chronological).
    const dedupedFixtures = dedupeById(fixtures);
    return {
      ok: true,
      bundle: {
        fixtures: dedupedFixtures,
        standings,
        source: source.name,
        fetchedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return { ok: false, error };
  }
}

function dedupeById(fixtures: readonly Fixture[]): Fixture[] {
  const seen = new Map<string, Fixture>();
  for (const fx of fixtures) seen.set(fx.id, fx);
  return Array.from(seen.values());
}

function toResponse(
  entry: CacheEntry<ResultsBundle>,
  refreshed: boolean,
  degraded: boolean,
): ResultsResponse {
  return {
    bundle: entry.data,
    lastUpdated: entry.lastUpdated,
    refreshed,
    degraded,
  };
}

export { readResultsConfig };

export function buildOwnersMap(
  draws: readonly ParticipantDraw[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const draw of draws) {
    for (const code of draw.teams) {
      map[code] = draw.participant;
    }
  }
  return map;
}

export function enrichLiveMatches(
  fixtures: readonly Fixture[],
  draws: readonly ParticipantDraw[],
): LiveMatch[] {
  const live = pickLiveFixtures(fixtures);
  if (live.length === 0) return [];
  const owners = buildOwnersMap(draws);
  return live.map((fixture) => ({
    fixture,
    owners: {
      home: fixture.home.code ? (owners[fixture.home.code] ?? null) : null,
      away: fixture.away.code ? (owners[fixture.away.code] ?? null) : null,
    },
  }));
}

export function groupLiveFixturesByParticipant(
  fixtures: readonly Fixture[],
  draws: readonly ParticipantDraw[],
): LiveFixturesByParticipant[] {
  const live = pickLiveFixtures(fixtures);
  if (live.length === 0) return [];

  const out: LiveFixturesByParticipant[] = [];
  for (const draw of draws) {
    const owned = new Set(draw.teams);
    const matchesForThisPerson = live.filter(
      (fx) =>
        (fx.home.code !== null && owned.has(fx.home.code)) ||
        (fx.away.code !== null && owned.has(fx.away.code)),
    );
    if (matchesForThisPerson.length > 0) {
      out.push({ participant: draw.participant, fixtures: matchesForThisPerson });
    }
  }
  return out;
}

