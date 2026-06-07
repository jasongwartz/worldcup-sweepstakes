import { z } from "zod";
import { FIXTURE_STAGES } from "./fixture-stages";
import { STAGES } from "./stages";

export const StageSchema = z.enum(STAGES);
export const FixtureStageSchema = z.enum(FIXTURE_STAGES);

export const TeamSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  group: z.string().min(1),
});

export const TournamentTeamsFileSchema = z.object({
  tournament: z.string(),
  teams: z.array(TeamSchema).length(48),
});

export const ParticipantsYamlSchema = z.object({
  teams: z.array(z.string().min(1)).min(1),
});

export const DrawYamlSchema = z.object({
  seed: z.string().optional(),
  drawnAt: z.string().optional(),
  assignments: z.record(z.array(z.string().min(1)).min(1)),
});

const GroupStatsSchema = z.object({
  played: z.number().int().min(0),
  won: z.number().int().min(0),
  drawn: z.number().int().min(0),
  lost: z.number().int().min(0),
  goalsFor: z.number().int().min(0),
  goalsAgainst: z.number().int().min(0),
  points: z.number().int().min(0),
});

const TeamStateSchema = z.object({
  code: z.string(),
  name: z.string(),
  group: z.string(),
  status: z.enum(["in", "out"]),
  stageReached: StageSchema,
  groupStats: GroupStatsSchema,
});

const MatchSchema = z.object({
  id: z.string(),
  stage: StageSchema,
  kickoff: z.string(),
  home: z.string(),
  away: z.string(),
  status: z.enum(["scheduled", "live", "finished"]),
  homeScore: z.number().int().nullable(),
  awayScore: z.number().int().nullable(),
});

export const TournamentSnapshotSchema = z.object({
  fetchedAt: z.string(),
  teams: z.record(z.string(), TeamStateSchema),
  matches: z.array(MatchSchema),
});

// ---------------------------------------------------------------------------
// Results data layer schemas
// ---------------------------------------------------------------------------

export const FixtureStatusSchema = z.enum([
  "scheduled",
  "live",
  "halftime",
  "extratime",
  "penaltyShootout",
  "finished",
  "postponed",
  "cancelled",
  "abandoned",
  "unknown",
]);

export const ResultsSourceNameSchema = z.enum([
  "openfootball",
  "api-football",
]);

const ScoreLineSchema = z.object({
  home: z.number().int().nullable(),
  away: z.number().int().nullable(),
});

const FixtureTeamSchema = z.object({
  code: z.string().nullable(),
  name: z.string(),
  resolved: z.boolean(),
});

export const FixtureSchema = z.object({
  id: z.string(),
  externalId: z.string(),
  source: ResultsSourceNameSchema,
  stage: FixtureStageSchema,
  group: z.string().nullable(),
  round: z.string(),
  kickoff: z.string(),
  status: FixtureStatusSchema,
  elapsed: z.number().int().nullable(),
  venue: z.string().nullable(),
  home: FixtureTeamSchema,
  away: FixtureTeamSchema,
  homeScore: z.number().int().nullable(),
  awayScore: z.number().int().nullable(),
  scoreBreakdown: z
    .object({
      halftime: ScoreLineSchema.optional(),
      fulltime: ScoreLineSchema.optional(),
      extratime: ScoreLineSchema.optional(),
      penalty: ScoreLineSchema.optional(),
    })
    .optional(),
});

const StandingRowSchema = z.object({
  rank: z.number().int().min(1),
  teamCode: z.string().nullable(),
  teamName: z.string(),
  played: z.number().int().min(0),
  won: z.number().int().min(0),
  drawn: z.number().int().min(0),
  lost: z.number().int().min(0),
  goalsFor: z.number().int().min(0),
  goalsAgainst: z.number().int().min(0),
  goalDifference: z.number().int(),
  points: z.number().int().min(0),
  form: z.string().nullable(),
});

export const GroupStandingSchema = z.object({
  group: z.string(),
  rows: z.array(StandingRowSchema),
});

export const ResultsBundleSchema = z.object({
  fixtures: z.array(FixtureSchema),
  standings: z.array(GroupStandingSchema),
  source: ResultsSourceNameSchema,
  fetchedAt: z.string(),
});
