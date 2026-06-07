// Tournament progression — order matters: index = depth reached.
// 2026 World Cup uses a Round of 32 for the first time (48 teams).

export const STAGES = [
  "GROUP",
  "R32",
  "R16",
  "QF",
  "SF",
  "FINAL",
  "WINNER",
] as const;

export type Stage = (typeof STAGES)[number];

export function stageDepth(stage: Stage): number {
  return STAGES.indexOf(stage);
}

export function maxStage(stages: readonly Stage[]): Stage {
  if (stages.length === 0) return "GROUP";
  return stages.reduce((deepest, current) =>
    stageDepth(current) > stageDepth(deepest) ? current : deepest,
  );
}

export const STAGE_LABELS: Record<Stage, string> = {
  GROUP: "Group stage",
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-final",
  SF: "Semi-final",
  FINAL: "Final",
  WINNER: "Winner",
};
