import { type Fixture, type GroupStanding } from "../../core/types.js";
import { openFootballSource } from "./openfootball.js";
import { type ResultsSource } from "./types.js";

/**
 * Wraps openfootball with synthetic scores + a couple of live matches so the
 * dev UI has something to display before the tournament actually starts.
 * Picks the first ~8 group-stage fixtures and marks them finished with
 * plausible scores; next 2 become live; everything else stays scheduled.
 */
export const demoSource: ResultsSource = {
  name: "openfootball",

  async getFixtures(input) {
    const real = await openFootballSource.getFixtures(input);
    return overlay(real);
  },

  async getStandings(input) {
    // Recompute standings from our overlaid fixtures so they line up.
    const fixtures = overlay(await openFootballSource.getFixtures(input));
    return deriveStandingsFromOverlay(fixtures, input.teams);
  },
};

function overlay(fixtures: readonly Fixture[]): Fixture[] {
  const groupFixtures = fixtures
    .filter((fx) => fx.stage === "GROUP")
    .slice()
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));

  // Most of the group stage played out, a handful of late matches still live.
  // Enough complete groups to trigger the new "eliminated" UI state.
  const finishedIds = new Set(groupFixtures.slice(0, 60).map((fx) => fx.id));
  const liveIds = new Set(groupFixtures.slice(60, 64).map((fx) => fx.id));

  let seed = 73;
  const rand = (): number => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const score = (): number => Math.floor(rand() * 4);

  return fixtures.map((fx) => {
    if (finishedIds.has(fx.id)) {
      const h = score();
      const a = score();
      return {
        ...fx,
        status: "finished",
        homeScore: h,
        awayScore: a,
        scoreBreakdown: { fulltime: { home: h, away: a } },
      };
    }
    if (liveIds.has(fx.id)) {
      const h = score();
      const a = score();
      return {
        ...fx,
        status: "live",
        elapsed: 22 + Math.floor(rand() * 60),
        homeScore: h,
        awayScore: a,
      };
    }
    return fx;
  });
}

export function deriveStandingsFromOverlay(
  fixtures: readonly Fixture[],
  teams: readonly { code: string; name: string; group: string }[],
): GroupStanding[] {
  const byGroup = new Map<
    string,
    Map<string, GroupStanding["rows"][number]>
  >();

  for (const team of teams) {
    let group = byGroup.get(team.group);
    if (!group) {
      group = new Map();
      byGroup.set(team.group, group);
    }
    group.set(team.code, {
      rank: 0,
      teamCode: team.code,
      teamName: team.name,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      form: null,
    });
  }

  for (const fx of fixtures) {
    if (fx.stage !== "GROUP") continue;
    if (fx.status !== "finished" && fx.status !== "live") continue;
    if (fx.homeScore === null || fx.awayScore === null) continue;
    if (!fx.home.code || !fx.away.code) continue;

    // Use openfootball's group label from the fixture's own group field.
    const group =
      byGroup.get(fx.group ?? "") ??
      byGroup.get(fx.home.code) ??
      null;
    if (!group) continue;
    const home = group.get(fx.home.code);
    const away = group.get(fx.away.code);
    if (!home || !away) continue;

    // Only count finished matches in standings; live matches don't add points yet.
    if (fx.status !== "finished") continue;

    apply(home, fx.homeScore, fx.awayScore);
    apply(away, fx.awayScore, fx.homeScore);
  }

  return Array.from(byGroup.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, rows]) => ({
      group,
      rows: rank(Array.from(rows.values())),
    }));
}

function apply(
  row: GroupStanding["rows"][number],
  gf: number,
  ga: number,
): void {
  row.played += 1;
  row.goalsFor += gf;
  row.goalsAgainst += ga;
  row.goalDifference = row.goalsFor - row.goalsAgainst;
  if (gf > ga) {
    row.won += 1;
    row.points += 3;
  } else if (gf === ga) {
    row.drawn += 1;
    row.points += 1;
  } else {
    row.lost += 1;
  }
}

function rank(
  rows: GroupStanding["rows"],
): GroupStanding["rows"] {
  const sorted = [...rows].sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.teamName.localeCompare(b.teamName),
  );
  return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
}
