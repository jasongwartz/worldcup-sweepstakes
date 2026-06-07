import { type FixtureStage } from "./fixture-stages.js";
import { type Stage } from "./stages.js";
export type { FixtureStage } from "./fixture-stages.js";

export type TeamCode = string;
export type ParticipantName = string;
export type ResultsSourceName = "openfootball" | "api-football";

export interface Team {
  code: TeamCode;
  name: string;
  group: string;
}

export interface GroupStats {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

export interface TeamState {
  code: TeamCode;
  name: string;
  group: string;
  status: "in" | "out";
  stageReached: Stage;
  groupStats: GroupStats;
}

export type MatchStatus = "scheduled" | "live" | "finished";

export interface Match {
  id: string;
  stage: Stage;
  kickoff: string; // ISO 8601
  home: TeamCode;
  away: TeamCode;
  status: MatchStatus;
  homeScore: number | null;
  awayScore: number | null;
}

export interface TournamentSnapshot {
  fetchedAt: string; // ISO 8601
  teams: Record<TeamCode, TeamState>;
  matches: Match[];
}

export interface ParticipantDraw {
  participant: ParticipantName;
  teams: TeamCode[];
}

export interface LeaderboardEntry {
  participant: ParticipantName;
  teams: LeaderboardTeamRef[];
  /** Rank of this participant's best-placed team. Primary sort key (lower = better). */
  bestRank: number;
  /** Sum of each team's tournament rank. Shown for context; secondary signal. */
  sumRank: number;
  /** sumRank / teams.length — useful when participants drew different counts. */
  averageRank: number;
  /** Position on the leaderboard, 1-indexed. Ties share a position. */
  position: number;
}

export interface LeaderboardTeamRef {
  code: TeamCode;
  name: string;
  /** Tournament-wide rank where 1 = best-performing team. */
  rank: number;
  /** Deepest bracket stage this team has appeared in. */
  reached: FixtureStage;
  /** True if the team has been eliminated. False = still alive in the tournament. */
  eliminated: boolean;
  /** True if this team is the tournament champion (won the final). */
  champion: boolean;
  /** Group stage points, for tiebreaking context in the UI. */
  points: number;
  goalDifference: number;
}

export interface Leaderboard {
  asOf: string;
  entries: LeaderboardEntry[];
}

// ---------------------------------------------------------------------------
// Results data layer — normalized across openfootball / API-Football.
// Sources are upserted by `externalId`; the public `id` is `source:externalId`
// so the two corpora never collide.
// ---------------------------------------------------------------------------

export type FixtureStatus =
  | "scheduled"
  | "live"
  | "halftime"
  | "extratime"
  | "penaltyShootout"
  | "finished"
  | "postponed"
  | "cancelled"
  | "abandoned"
  | "unknown";

export interface FixtureTeam {
  /** Tournament team code if resolvable (e.g. "MEX"), null otherwise. */
  code: TeamCode | null;
  /** Raw name as reported by the source, or a placeholder like "W101". */
  name: string;
  /** False for bracket placeholders (knockout fixtures that don't yet know which team will arrive). */
  resolved: boolean;
}

export interface ScoreLine {
  home: number | null;
  away: number | null;
}

export interface FixtureScoreBreakdown {
  halftime?: ScoreLine;
  fulltime?: ScoreLine;
  extratime?: ScoreLine;
  penalty?: ScoreLine;
}

export interface Fixture {
  id: string;
  externalId: string;
  source: ResultsSourceName;
  stage: FixtureStage;
  /** "A".."L" for group-stage matches; null for knockouts. */
  group: string | null;
  /** Human label from the source ("Matchday 1", "Round of 16"). */
  round: string;
  /** ISO 8601 UTC kickoff. */
  kickoff: string;
  status: FixtureStatus;
  /** Minutes elapsed (only live matches; null otherwise). */
  elapsed: number | null;
  venue: string | null;
  home: FixtureTeam;
  away: FixtureTeam;
  homeScore: number | null;
  awayScore: number | null;
  /** Optional richer breakdown (provided by API-Football, omitted by openfootball). */
  scoreBreakdown?: FixtureScoreBreakdown;
}

export interface StandingRow {
  rank: number;
  teamCode: TeamCode | null;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  /** Recent form like "WDW" — only present when the source provides it. */
  form: string | null;
}

export interface GroupStanding {
  group: string;
  rows: StandingRow[];
}

export interface ResultsBundle {
  fixtures: Fixture[];
  standings: GroupStanding[];
  source: ResultsSourceName;
  /** ISO 8601 UTC when this bundle was fetched from the upstream source. */
  fetchedAt: string;
}

export interface LiveFixturesByParticipant {
  participant: ParticipantName;
  fixtures: Fixture[];
}

/** A live match enriched with the participant who drew each team. */
export interface LiveMatch {
  fixture: Fixture;
  owners: {
    home: ParticipantName | null;
    away: ParticipantName | null;
  };
}
