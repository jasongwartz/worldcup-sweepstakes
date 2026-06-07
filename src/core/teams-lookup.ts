import { type Team, type TeamCode } from "./types.ts";

/**
 * Build a normalized-name → code lookup so upstream team names from either
 * provider can be mapped back to our tournament team codes.
 */
export function buildTeamCodeIndex(teams: readonly Team[]): Map<string, TeamCode> {
  const index = new Map<string, TeamCode>();
  for (const team of teams) {
    index.set(normalize(team.name), team.code);
    // Allow lookup by code too so adapters that already provide a FIFA-style
    // code (e.g. "MEX") still resolve.
    index.set(normalize(team.code), team.code);
  }
  return index;
}

export function lookupTeamCode(
  index: ReadonlyMap<string, TeamCode>,
  name: string,
): TeamCode | null {
  return index.get(normalize(name)) ?? null;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}
