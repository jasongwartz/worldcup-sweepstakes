// Where a fixture sits in the 2026 bracket. Separate from `Stage` (which
// represents "how far has this team progressed") because the 3rd-place
// playoff is a side branch: semi-final losers go there, semi-final winners
// go to the FINAL.

export const FIXTURE_STAGES = [
  "GROUP",
  "R32",
  "R16",
  "QF",
  "SF",
  "THIRD",
  "FINAL",
] as const;

export type FixtureStage = (typeof FIXTURE_STAGES)[number];

export const FIXTURE_STAGE_LABELS: Record<FixtureStage, string> = {
  GROUP: "Group stage",
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-final",
  SF: "Semi-final",
  THIRD: "Third place playoff",
  FINAL: "Final",
};
