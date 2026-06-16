import { type Team, type TeamCode } from "./types.js";

/**
 * Alternate names a results provider might report for a team, keyed by FIFA
 * code. `tournament-teams.json` only stores the single spelling openfootball
 * uses, so when api-football (or vice versa) reports a different-but-equivalent
 * name the bare name→code index misses and the team resolves to `null` — which
 * surfaces in the UI as "unclaimed" even though the team was drawn.
 *
 * Listing every known spelling here lets the index resolve a team regardless of
 * which provider is active. Entries are matched after the same normalization
 * applied to names (case-, accent-, punctuation-insensitive), so only genuinely
 * different spellings need listing — not accent or casing variants.
 */
const NAME_ALIASES: Record<TeamCode, readonly string[]> = {
  TUR: ["Turkey", "Türkiye", "Turkiye"],
  CPV: ["Cape Verde", "Cape Verde Islands", "Cabo Verde"],
  CZE: ["Czech Republic", "Czechia"],
  CIV: ["Ivory Coast", "Côte d'Ivoire", "Cote d'Ivoire"],
  KOR: ["South Korea", "Korea Republic", "Republic of Korea"],
  USA: ["United States", "USA", "United States of America"],
  BIH: ["Bosnia & Herzegovina", "Bosnia and Herzegovina"],
  CUW: ["Curaçao", "Curacao"],
  IRN: ["Iran", "IR Iran"],
  KSA: ["Saudi Arabia"],
  COD: ["DR Congo", "Congo DR", "Democratic Republic of the Congo"],
  RSA: ["South Africa"],
};

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
    // Register any known alternate spellings for this team's code so a provider
    // reporting a different name (e.g. "Türkiye" vs "Turkey") still resolves.
    for (const alias of NAME_ALIASES[team.code] ?? []) {
      index.set(normalize(alias), team.code);
    }
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
