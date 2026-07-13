import { type Fixture, type FixtureStatus } from "../../core/types.js";

const LIVE_STATUSES = new Set<FixtureStatus>([
  "live",
  "halftime",
  "extratime",
  "penaltyShootout",
]);

const PRE_KICKOFF_WINDOW_MS = 30 * 60_000; // start refreshing 30 min before kickoff

/**
 * True if any fixture is mid-match, close to kickoff, or past kickoff but not
 * yet reported finished. Lets the SWR layer skip upstream fetches the rest of
 * the time, since results can't have changed.
 *
 * The window has no post-kickoff cutoff on purpose: openfootball flips a match
 * scheduled → finished only when a maintainer commits the result, which can
 * land hours after full time. A cutoff would freeze the pre-result snapshot
 * until the *next* round's kickoff. The cache TTL still rate-limits upstream
 * fetches, and once every started fixture is finished the window closes.
 */
export function isInLiveWindow(
  fixtures: readonly Fixture[],
  now: Date = new Date(),
): boolean {
  const nowMs = now.getTime();
  for (const fx of fixtures) {
    if (LIVE_STATUSES.has(fx.status)) return true;
    if (fx.status === "scheduled") {
      const kickoffMs = Date.parse(fx.kickoff);
      if (Number.isNaN(kickoffMs)) continue;
      if (nowMs >= kickoffMs - PRE_KICKOFF_WINDOW_MS) return true;
    }
  }
  return false;
}

export function pickLiveFixtures(fixtures: readonly Fixture[]): Fixture[] {
  return fixtures.filter((fx) => LIVE_STATUSES.has(fx.status));
}
