import { z } from "zod";
import { type FixtureStage } from "../../core/fixture-stages.ts";
import { buildTeamCodeIndex, lookupTeamCode } from "../../core/teams-lookup.ts";
import {
  type Fixture,
  type FixtureStatus,
  type FixtureTeam,
  type GroupStanding,
  type StandingRow,
  type TeamCode,
} from "../../core/types.ts";
import { type ResultsSource } from "./types.ts";

const BASE_URL = "https://v3.football.api-sports.io";
const WC_LEAGUE_ID = 1;

const ScoreLineSchema = z.object({
  home: z.number().int().nullable(),
  away: z.number().int().nullable(),
});

const AfTeamSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  logo: z.string().optional(),
  winner: z.boolean().nullable().optional(),
});

const AfFixtureSchema = z.object({
  fixture: z.object({
    id: z.number().int(),
    date: z.string(),
    timestamp: z.number().int().optional(),
    status: z.object({
      long: z.string(),
      short: z.string(),
      elapsed: z.number().int().nullable().optional(),
    }),
    venue: z
      .object({ name: z.string().nullable().optional() })
      .optional(),
  }),
  league: z.object({
    id: z.number().int(),
    name: z.string(),
    season: z.number().int(),
    round: z.string(),
  }),
  teams: z.object({ home: AfTeamSchema, away: AfTeamSchema }),
  goals: z.object({
    home: z.number().int().nullable(),
    away: z.number().int().nullable(),
  }),
  score: z.object({
    halftime: ScoreLineSchema,
    fulltime: ScoreLineSchema,
    extratime: ScoreLineSchema,
    penalty: ScoreLineSchema,
  }),
});

const AfFixturesResponseSchema = z.object({
  errors: z.union([z.array(z.string()), z.record(z.string(), z.string())]).optional(),
  results: z.number().int(),
  response: z.array(AfFixtureSchema),
});

const AfStandingRowSchema = z.object({
  rank: z.number().int(),
  team: AfTeamSchema,
  points: z.number().int(),
  goalsDiff: z.number().int(),
  group: z.string(),
  form: z.string().nullable().optional(),
  all: z.object({
    played: z.number().int(),
    win: z.number().int(),
    draw: z.number().int(),
    lose: z.number().int(),
    goals: z.object({ for: z.number().int(), against: z.number().int() }),
  }),
});

const AfStandingsResponseSchema = z.object({
  errors: z.union([z.array(z.string()), z.record(z.string(), z.string())]).optional(),
  results: z.number().int(),
  response: z.array(
    z.object({
      league: z.object({
        id: z.number().int(),
        name: z.string(),
        standings: z.array(z.array(AfStandingRowSchema)),
      }),
    }),
  ),
});

type AfFixture = z.infer<typeof AfFixtureSchema>;
type AfStandingRow = z.infer<typeof AfStandingRowSchema>;

const STATUS_MAP: Record<string, FixtureStatus> = {
  TBD: "scheduled",
  NS: "scheduled",
  "1H": "live",
  "2H": "live",
  LIVE: "live",
  HT: "halftime",
  ET: "extratime",
  BT: "extratime",
  P: "penaltyShootout",
  SUSP: "live",
  INT: "live",
  FT: "finished",
  AET: "finished",
  PEN: "finished",
  AWD: "finished",
  WO: "finished",
  PST: "postponed",
  CANC: "cancelled",
  ABD: "abandoned",
};

const ROUND_STAGE_MAP: { test: RegExp; stage: FixtureStage }[] = [
  { test: /^group stage/i, stage: "GROUP" },
  { test: /round of 32/i, stage: "R32" },
  { test: /round of 16/i, stage: "R16" },
  { test: /quarter[- ]final/i, stage: "QF" },
  { test: /semi[- ]final/i, stage: "SF" },
  { test: /3rd place/i, stage: "THIRD" },
  { test: /^final/i, stage: "FINAL" },
];

export interface ApiFootballConfig {
  apiKey: string;
  season: number;
}

export function apiFootballSource(config: ApiFootballConfig): ResultsSource {
  const headers = { "x-apisports-key": config.apiKey };

  async function get<T extends z.ZodTypeAny>(
    path: string,
    schema: T,
  ): Promise<z.infer<T>> {
    const res = await fetch(`${BASE_URL}${path}`, { headers });
    if (!res.ok) {
      throw new Error(
        `api-football ${path} failed: ${String(res.status)} ${res.statusText}`,
      );
    }
    const raw: unknown = await res.json();
    const parsed = schema.parse(raw) as z.infer<T> & { errors?: unknown };
    if (parsed.errors && hasErrorEntries(parsed.errors)) {
      throw new Error(
        `api-football ${path} returned errors: ${JSON.stringify(parsed.errors)}`,
      );
    }
    return parsed;
  }

  return {
    name: "api-football",

    async getFixtures({ teams }) {
      const url = `/fixtures?league=${String(WC_LEAGUE_ID)}&season=${String(config.season)}`;
      const data = await get(url, AfFixturesResponseSchema);
      const index = buildTeamCodeIndex(teams);
      return data.response.map((f) => normalizeFixture(f, index));
    },

    async getStandings({ teams }) {
      const url = `/standings?league=${String(WC_LEAGUE_ID)}&season=${String(config.season)}`;
      const data = await get(url, AfStandingsResponseSchema);
      const groups = data.response[0]?.league.standings ?? [];
      const index = buildTeamCodeIndex(teams);
      return groups.map((rows) => normalizeStandingGroup(rows, index));
    },
  };
}

function normalizeFixture(
  f: AfFixture,
  teamCodeIndex: ReadonlyMap<string, TeamCode>,
): Fixture {
  const stage = mapRound(f.league.round);
  const group = stage === "GROUP" ? extractGroupFromRound(f.league.round) : null;
  const status = STATUS_MAP[f.fixture.status.short] ?? "unknown";
  return {
    id: `api-football:${String(f.fixture.id)}`,
    externalId: String(f.fixture.id),
    source: "api-football",
    stage,
    group,
    round: f.league.round,
    kickoff: new Date(f.fixture.date).toISOString(),
    status,
    elapsed: f.fixture.status.elapsed ?? null,
    venue: f.fixture.venue?.name ?? null,
    home: makeTeam(f.teams.home.name, teamCodeIndex),
    away: makeTeam(f.teams.away.name, teamCodeIndex),
    homeScore: f.goals.home,
    awayScore: f.goals.away,
    scoreBreakdown: {
      halftime: f.score.halftime,
      fulltime: f.score.fulltime,
      extratime: f.score.extratime,
      penalty: f.score.penalty,
    },
  };
}

function normalizeStandingGroup(
  rows: readonly AfStandingRow[],
  teamCodeIndex: ReadonlyMap<string, TeamCode>,
): GroupStanding {
  const groupLabel = rows[0]?.group ?? "";
  const normalizedGroup = groupLabel.replace(/^Group\s+/i, "");
  const standingRows: StandingRow[] = rows.map((r) => ({
    rank: r.rank,
    teamCode: lookupTeamCode(teamCodeIndex, r.team.name),
    teamName: r.team.name,
    played: r.all.played,
    won: r.all.win,
    drawn: r.all.draw,
    lost: r.all.lose,
    goalsFor: r.all.goals.for,
    goalsAgainst: r.all.goals.against,
    goalDifference: r.goalsDiff,
    points: r.points,
    form: r.form ?? null,
  }));
  return { group: normalizedGroup, rows: standingRows };
}

function mapRound(round: string): FixtureStage {
  for (const { test, stage } of ROUND_STAGE_MAP) {
    if (test.test(round)) return stage;
  }
  return "GROUP";
}

function extractGroupFromRound(round: string): string | null {
  // API-Football's "Group Stage - 1" doesn't carry the group letter, so the
  // group field has to come from elsewhere. For 2026 the standings endpoint
  // tells us which group each team belongs to — fixtures alone don't.
  // Returning null here means the route layer should join fixtures→standings
  // when it needs to know the group of a group-stage fixture.
  void round;
  return null;
}

function makeTeam(
  rawName: string,
  index: ReadonlyMap<string, TeamCode>,
): FixtureTeam {
  const code = lookupTeamCode(index, rawName);
  return { code, name: rawName, resolved: code !== null };
}

function hasErrorEntries(errors: unknown): boolean {
  if (Array.isArray(errors)) return errors.length > 0;
  if (errors && typeof errors === "object") {
    return Object.keys(errors).length > 0;
  }
  return false;
}
