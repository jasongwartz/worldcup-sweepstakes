import { z } from "zod";
import { type FixtureStage } from "../../core/fixture-stages";
import { buildTeamCodeIndex, lookupTeamCode } from "../../core/teams-lookup";
import {
  type Fixture,
  type FixtureTeam,
  type GroupStanding,
  type StandingRow,
  type Team,
  type TeamCode,
} from "../../core/types";
import { type ResultsSource } from "./types";

const OF_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

const OpenFootballScoreSchema = z.object({
  ft: z.array(z.number().int()).length(2).optional(),
  ht: z.array(z.number().int()).length(2).optional(),
  et: z.array(z.number().int()).length(2).optional(),
  p: z.array(z.number().int()).length(2).optional(),
});

const OpenFootballMatchSchema = z.object({
  num: z.union([z.number(), z.string()]).optional(),
  round: z.string(),
  date: z.string(),
  /** e.g. "13:00 UTC-6" — stadium-local time with explicit offset. */
  time: z.string(),
  team1: z.string(),
  team2: z.string(),
  group: z.string().optional(),
  ground: z.string().optional(),
  score: OpenFootballScoreSchema.optional(),
});

const OpenFootballFileSchema = z.object({
  name: z.string(),
  matches: z.array(OpenFootballMatchSchema),
});

type OpenFootballMatch = z.infer<typeof OpenFootballMatchSchema>;

const ROUND_STAGE_MAP: { test: RegExp; stage: FixtureStage }[] = [
  { test: /^matchday\b/i, stage: "GROUP" },
  { test: /^round of 32\b/i, stage: "R32" },
  { test: /^round of 16\b/i, stage: "R16" },
  { test: /^quarter[- ]final/i, stage: "QF" },
  { test: /^semi[- ]final/i, stage: "SF" },
  { test: /^(match for )?third( place)?/i, stage: "THIRD" },
  { test: /^final\b/i, stage: "FINAL" },
];

export const openFootballSource: ResultsSource = {
  name: "openfootball",

  async getFixtures({ teams }) {
    const file = await fetchOpenFootball();
    const index = buildTeamCodeIndex(teams);
    return file.matches.map((m, i) => normalizeMatch(m, i, index));
  },

  async getStandings({ teams }) {
    // openfootball doesn't publish standings — derive them from finished
    // group-stage matches. Empty until matches start finishing.
    const file = await fetchOpenFootball();
    const index = buildTeamCodeIndex(teams);
    const fixtures = file.matches.map((m, i) => normalizeMatch(m, i, index));
    return deriveStandingsFromFixtures(fixtures, teams);
  },
};

async function fetchOpenFootball(): Promise<z.infer<typeof OpenFootballFileSchema>> {
  const res = await fetch(OF_URL);
  if (!res.ok) {
    throw new Error(
      `openfootball fetch failed: ${String(res.status)} ${res.statusText}`,
    );
  }
  const raw: unknown = await res.json();
  return OpenFootballFileSchema.parse(raw);
}

function normalizeMatch(
  m: OpenFootballMatch,
  index: number,
  teamCodeIndex: ReadonlyMap<string, TeamCode>,
): Fixture {
  const stage = mapRound(m.round);
  const num = m.num !== undefined ? String(m.num) : `i${String(index)}`;
  const externalId = `${num}-${m.date}`;
  const kickoff = parseLocalKickoff(m.date, m.time);

  const homeScore = m.score?.ft?.[0] ?? m.score?.et?.[0] ?? null;
  const awayScore = m.score?.ft?.[1] ?? m.score?.et?.[1] ?? null;
  const finished = m.score?.ft !== undefined || m.score?.et !== undefined;

  return {
    id: `openfootball:${externalId}`,
    externalId,
    source: "openfootball",
    stage,
    group: m.group ? m.group.replace(/^Group\s+/i, "") : null,
    round: m.round,
    kickoff,
    status: finished ? "finished" : "scheduled",
    elapsed: null,
    venue: m.ground ?? null,
    home: makeTeam(m.team1, teamCodeIndex),
    away: makeTeam(m.team2, teamCodeIndex),
    homeScore,
    awayScore,
    ...(m.score
      ? {
          scoreBreakdown: {
            ...(m.score.ht
              ? { halftime: { home: m.score.ht[0] ?? null, away: m.score.ht[1] ?? null } }
              : {}),
            ...(m.score.ft
              ? { fulltime: { home: m.score.ft[0] ?? null, away: m.score.ft[1] ?? null } }
              : {}),
            ...(m.score.et
              ? { extratime: { home: m.score.et[0] ?? null, away: m.score.et[1] ?? null } }
              : {}),
            ...(m.score.p
              ? { penalty: { home: m.score.p[0] ?? null, away: m.score.p[1] ?? null } }
              : {}),
          },
        }
      : {}),
  };
}

function mapRound(round: string): FixtureStage {
  for (const { test, stage } of ROUND_STAGE_MAP) {
    if (test.test(round)) return stage;
  }
  return "GROUP";
}

/**
 * openfootball times look like "13:00 UTC-6" — stadium-local clock time with
 * an explicit UTC offset. Parse that into a UTC ISO 8601 timestamp.
 */
function parseLocalKickoff(date: string, time: string): string {
  // Tolerate trailing whitespace and case variations.
  const m = /^(\d{1,2}):(\d{2})\s+UTC([+-]\d{1,2})(?::?(\d{2}))?$/i.exec(
    time.trim(),
  );
  if (!m) {
    // Fall back to treating it as UTC if we can't parse — better than throwing.
    return `${date}T${time}:00Z`;
  }
  const hh = m[1] ?? "00";
  const mm = m[2] ?? "00";
  const offH = m[3] ?? "+0";
  const offM = m[4];
  const offsetHours = Number(offH);
  const offsetMinutes = offsetHours * 60 + (offM ? Number(offM) : 0) * Math.sign(offsetHours);
  const local = new Date(`${date}T${hh.padStart(2, "0")}:${mm}:00Z`);
  const utcMs = local.getTime() - offsetMinutes * 60_000;
  return new Date(utcMs).toISOString();
}

function makeTeam(
  rawName: string,
  index: ReadonlyMap<string, TeamCode>,
): FixtureTeam {
  // Placeholders look like "W101", "RU1A", "1A", etc. — short codes that
  // describe bracket positions rather than real teams.
  const placeholder = /^[A-Z0-9]{2,5}$/.test(rawName) && rawName !== rawName.toLowerCase();
  const code = placeholder ? null : lookupTeamCode(index, rawName);
  return {
    code,
    name: rawName,
    resolved: code !== null,
  };
}

/**
 * Best-effort standings from finished group-stage fixtures. Used as a
 * fallback so the standings endpoint isn't empty when openfootball is the
 * only available source.
 */
function deriveStandingsFromFixtures(
  fixtures: readonly Fixture[],
  teams: readonly Team[],
): GroupStanding[] {
  const byGroup = new Map<string, Map<TeamCode, StandingRow>>();

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
    if (fx.stage !== "GROUP" || fx.status !== "finished") continue;
    if (fx.homeScore === null || fx.awayScore === null) continue;
    if (!fx.home.code || !fx.away.code || !fx.group) continue;
    const group = byGroup.get(fx.group);
    if (!group) continue;
    const home = group.get(fx.home.code);
    const away = group.get(fx.away.code);
    if (!home || !away) continue;

    applyResult(home, fx.homeScore, fx.awayScore);
    applyResult(away, fx.awayScore, fx.homeScore);
  }

  return Array.from(byGroup.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, rows]) => ({
      group,
      rows: rankRows(Array.from(rows.values())),
    }));
}

function applyResult(row: StandingRow, gf: number, ga: number): void {
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

function rankRows(rows: StandingRow[]): StandingRow[] {
  const sorted = [...rows].sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.teamName.localeCompare(b.teamName),
  );
  return sorted.map((row, i) => ({ ...row, rank: i + 1 }));
}
