import { type Fixture, type FixtureStatus } from "../../core/types.js";

const LIVE_STATUSES = new Set<FixtureStatus>([
  "live",
  "halftime",
  "extratime",
  "penaltyShootout",
]);

const PRE_KICKOFF_WINDOW_MS = 30 * 60_000; // start refreshing 30 min before kickoff
const POST_KICKOFF_WINDOW_MS = 4 * 60 * 60_000; // keep refreshing until 4h after (covers ET + penalties + late status updates)

/**
 * True if any fixture is mid-match or close enough to kickoff that we should
 * keep the cache fresh. Lets the SWR layer skip upstream fetches the rest of
 * the time, since results can't have changed.
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
      if (
        nowMs >= kickoffMs - PRE_KICKOFF_WINDOW_MS &&
        nowMs <= kickoffMs + POST_KICKOFF_WINDOW_MS
      ) {
        return true;
      }
    }
  }
  return false;
}

export function pickLiveFixtures(fixtures: readonly Fixture[]): Fixture[] {
  return fixtures.filter((fx) => LIVE_STATUSES.has(fx.status));
}
