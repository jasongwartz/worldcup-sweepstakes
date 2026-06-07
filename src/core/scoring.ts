import {
  FIXTURE_STAGES,
  type FixtureStage,
} from "./fixture-stages.js";
import {
  type Fixture,
  type GroupStanding,
  type Leaderboard,
  type LeaderboardEntry,
  type LeaderboardTeamRef,
  type ParticipantDraw,
  type TeamCode,
} from "./types.js";

interface TeamScoreData {
  code: TeamCode;
  name: string;
  reached: FixtureStage;
  /** Stage at which this team lost their match, or null if still alive. */
  eliminatedAt: FixtureStage | null;
  /** Won the final — bumps above every other team. */
  champion: boolean;
  points: number;
  goalDifference: number;
  goalsFor: number;
}

interface TeamRankInfo {
  rank: number;
  eliminated: boolean;
  champion: boolean;
}

/**
 * Tournament-wide ranking of every team. Lower rank = better-placed.
 *
 * Sort order:
 *   1. Champion always at rank 1.
 *   2. Deepest stage reached (FINAL > SF > QF > R16 > R32 > GROUP).
 *   3. Still alive at that stage (won their last match) > eliminated at that stage.
 *   4. Group-stage points / GD / GF.
 *   5. Name (alphabetical, deterministic tiebreaker).
 */
export function rankAllTeams(
  fixtures: readonly Fixture[],
  standings: readonly GroupStanding[],
): Map<TeamCode, TeamRankInfo> {
  const teams = collectTeamData(fixtures, standings);
  const sorted = Array.from(teams.values()).sort(compareTeams);

  const info = new Map<TeamCode, TeamRankInfo>();
  sorted.forEach((team, i) => {
    info.set(team.code, {
      rank: i + 1,
      eliminated: team.eliminatedAt !== null,
      champion: team.champion,
    });
  });
  return info;
}

function compareTeams(a: TeamScoreData, b: TeamScoreData): number {
  if (a.champion !== b.champion) return a.champion ? -1 : 1;

  const stageDelta = stageDepth(b.reached) - stageDepth(a.reached);
  if (stageDelta !== 0) return stageDelta;

  // Within the same cohort: still-alive teams sort above eliminated ones.
  const aAlive = a.eliminatedAt === null;
  const bAlive = b.eliminatedAt === null;
  if (aAlive !== bAlive) return aAlive ? -1 : 1;

  return (
    b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
    a.name.localeCompare(b.name)
  );
}

function stageDepth(stage: FixtureStage): number {
  return FIXTURE_STAGES.indexOf(stage);
}

/**
 * Compute the participant leaderboard.
 *
 * Position is determined by the rank of each participant's BEST-placed team
 * (winner-takes-all framing). Ties on the best team are broken by 2nd-best,
 * then 3rd-best, then sum of all team ranks. Ties share a position.
 */
export function computeLeaderboard(deps: {
  fixtures: readonly Fixture[];
  standings: readonly GroupStanding[];
  draws: readonly ParticipantDraw[];
  asOf: string;
}): Leaderboard {
  const teamInfo = rankAllTeams(deps.fixtures, deps.standings);
  const teamData = collectTeamData(deps.fixtures, deps.standings);
  const unrankedFallback = teamInfo.size + 1;

  const scored = deps.draws.map((draw): Omit<LeaderboardEntry, "position"> => {
    const teamRefs: LeaderboardTeamRef[] = draw.teams.map((code) => {
      const data = teamData.get(code);
      const info = teamInfo.get(code);
      return {
        code,
        name: data?.name ?? code,
        rank: info?.rank ?? unrankedFallback,
        reached: data?.reached ?? "GROUP",
        eliminated: info?.eliminated ?? false,
        champion: info?.champion ?? false,
        points: data?.points ?? 0,
        goalDifference: data?.goalDifference ?? 0,
      };
    });

    teamRefs.sort((a, b) => a.rank - b.rank);

    const sumRank = teamRefs.reduce((s, t) => s + t.rank, 0);
    const bestRank = teamRefs[0]?.rank ?? unrankedFallback;
    return {
      participant: draw.participant,
      teams: teamRefs,
      bestRank,
      sumRank,
      averageRank: teamRefs.length ? sumRank / teamRefs.length : 0,
    };
  });

  scored.sort(compareEntries);

  let position = 0;
  let prev: Omit<LeaderboardEntry, "position"> | undefined;
  const entries = scored.map((entry, i): LeaderboardEntry => {
    if (!prev || compareEntries(prev, entry) !== 0) position = i + 1;
    prev = entry;
    return { ...entry, position };
  });

  return { asOf: deps.asOf, entries };
}

function compareEntries(
  a: Omit<LeaderboardEntry, "position">,
  b: Omit<LeaderboardEntry, "position">,
): number {
  // Compare team ranks pairwise (already sorted ascending in each entry).
  const len = Math.max(a.teams.length, b.teams.length);
  for (let i = 0; i < len; i++) {
    const ar = a.teams[i]?.rank ?? Number.MAX_SAFE_INTEGER;
    const br = b.teams[i]?.rank ?? Number.MAX_SAFE_INTEGER;
    if (ar !== br) return ar - br;
  }
  return a.sumRank - b.sumRank || a.averageRank - b.averageRank;
}

function collectTeamData(
  fixtures: readonly Fixture[],
  standings: readonly GroupStanding[],
): Map<TeamCode, TeamScoreData> {
  const teams = new Map<TeamCode, TeamScoreData>();

  for (const group of standings) {
    for (const row of group.rows) {
      if (!row.teamCode) continue;
      teams.set(row.teamCode, {
        code: row.teamCode,
        name: row.teamName,
        reached: "GROUP",
        eliminatedAt: null,
        champion: false,
        points: row.points,
        goalDifference: row.goalDifference,
        goalsFor: row.goalsFor,
      });
    }
  }

  // Track deepest stage reached + name updates from fixtures.
  for (const fx of fixtures) {
    for (const side of [fx.home, fx.away]) {
      if (!side.resolved || !side.code) continue;
      const existing = teams.get(side.code);
      if (!existing) {
        teams.set(side.code, {
          code: side.code,
          name: side.name,
          reached: fx.stage,
          eliminatedAt: null,
          champion: false,
          points: 0,
          goalDifference: 0,
          goalsFor: 0,
        });
        continue;
      }
      if (stageDepth(fx.stage) > stageDepth(existing.reached)) {
        existing.reached = fx.stage;
      }
      if (side.name && side.name !== side.code) existing.name = side.name;
    }
  }

  // Detect knockout eliminations from finished fixtures.
  for (const fx of fixtures) {
    if (fx.stage === "GROUP") continue;
    if (fx.status !== "finished") continue;
    const winner = resolveKnockoutWinner(fx);
    if (!winner) continue;
    const loserSide = fx[winner === "home" ? "away" : "home"];
    if (loserSide.code) {
      const team = teams.get(loserSide.code);
      if (team?.eliminatedAt === null) team.eliminatedAt = fx.stage;
    }
    // Crown the champion when the FINAL is finished.
    if (fx.stage === "FINAL") {
      const winnerSide = fx[winner];
      if (winnerSide.code) {
        const champ = teams.get(winnerSide.code);
        if (champ) champ.champion = true;
      }
    }
  }

  // Detect group-stage eliminations once a group is complete.
  for (const group of standings) {
    const complete =
      group.rows.length > 0 && group.rows.every((r) => r.played >= 3);
    if (!complete) continue;
    for (const row of group.rows) {
      if (!row.teamCode) continue;
      const team = teams.get(row.teamCode);
      if (!team) continue;
      if (team.reached !== "GROUP") continue; // already advanced
      if (row.rank > 2) team.eliminatedAt = "GROUP";
    }
  }

  return teams;
}

function resolveKnockoutWinner(fx: Fixture): "home" | "away" | null {
  const pen = fx.scoreBreakdown?.penalty;
  if (
    pen?.home != null &&
    pen.away != null &&
    pen.home !== pen.away
  ) {
    return pen.home > pen.away ? "home" : "away";
  }
  const et = fx.scoreBreakdown?.extratime;
  if (
    et?.home != null &&
    et.away != null &&
    et.home !== et.away
  ) {
    return et.home > et.away ? "home" : "away";
  }
  if (fx.homeScore == null || fx.awayScore == null) return null;
  if (fx.homeScore === fx.awayScore) return null;
  return fx.homeScore > fx.awayScore ? "home" : "away";
}
