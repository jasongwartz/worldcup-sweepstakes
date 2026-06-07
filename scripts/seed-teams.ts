#!/usr/bin/env tsx
/**
 * Fetch openfootball/worldcup.json for 2026, extract the 48 participating
 * teams + their groups, and write `data/tournament-teams.json`.
 *
 * Run by `prebuild` and `predev` so the file is always derived from the
 * upstream draw. The output is gitignored — there's no source-of-truth
 * file checked in; openfootball is the source.
 *
 * Usage: tsx scripts/seed-teams.ts [--out <path>]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "./lib/cli";

const OF_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

/** FIFA 3-letter codes for the 48 expected 2026 nations. */
const FIFA_CODES: Record<string, string> = {
  Mexico: "MEX",
  Canada: "CAN",
  "United States": "USA",
  USA: "USA",
  Argentina: "ARG",
  Brazil: "BRA",
  Uruguay: "URU",
  Colombia: "COL",
  Ecuador: "ECU",
  Paraguay: "PAR",
  France: "FRA",
  England: "ENG",
  Spain: "ESP",
  Germany: "GER",
  Portugal: "POR",
  Netherlands: "NED",
  Italy: "ITA",
  Belgium: "BEL",
  Croatia: "CRO",
  Switzerland: "SUI",
  Norway: "NOR",
  Sweden: "SWE",
  Austria: "AUT",
  Scotland: "SCO",
  Turkey: "TUR",
  Türkiye: "TUR",
  Japan: "JPN",
  "South Korea": "KOR",
  "Korea Republic": "KOR",
  Australia: "AUS",
  Iran: "IRN",
  "Saudi Arabia": "KSA",
  Qatar: "QAT",
  Iraq: "IRQ",
  Uzbekistan: "UZB",
  Jordan: "JOR",
  Senegal: "SEN",
  Morocco: "MAR",
  Tunisia: "TUN",
  Algeria: "ALG",
  Egypt: "EGY",
  "Ivory Coast": "CIV",
  "Côte d'Ivoire": "CIV",
  "South Africa": "RSA",
  "Cape Verde": "CPV",
  "DR Congo": "COD",
  Ghana: "GHA",
  "Costa Rica": "CRC",
  Panama: "PAN",
  Haiti: "HAI",
  Curaçao: "CUW",
  "New Zealand": "NZL",
  "Bosnia & Herzegovina": "BIH",
  "Bosnia and Herzegovina": "BIH",
};

interface OpenFootballMatch {
  round?: string;
  group?: string;
  team1?: string;
  team2?: string;
}

interface OpenFootballFile {
  name?: string;
  matches?: OpenFootballMatch[];
}

const { flags } = parseArgs(process.argv.slice(2));
const outPath = resolve(flags.out ?? "data/tournament-teams.json");

const res = await fetch(OF_URL);
if (!res.ok) {
  process.stderr.write(
    `seed-teams: openfootball fetch failed (${String(res.status)} ${res.statusText})\n`,
  );
  process.exit(1);
}
const file = (await res.json()) as OpenFootballFile;

const groupTeams = new Map<string, Set<string>>();
for (const m of file.matches ?? []) {
  if (!m.group || !m.team1 || !m.team2) continue;
  if (!/^matchday/i.test(m.round ?? "")) continue;
  if (!/^Group [A-L]$/i.test(m.group)) continue;
  const letter = m.group.replace(/^Group\s+/i, "");
  let set = groupTeams.get(letter);
  if (!set) {
    set = new Set<string>();
    groupTeams.set(letter, set);
  }
  set.add(m.team1);
  set.add(m.team2);
}

const unknown: string[] = [];
const usedCodes = new Map<string, number>();
const teams: { code: string; name: string; group: string }[] = [];

for (const letter of Array.from(groupTeams.keys()).sort()) {
  const list = Array.from(groupTeams.get(letter) ?? []).sort();
  for (const name of list) {
    let code = FIFA_CODES[name];
    if (!code) {
      unknown.push(name);
      // Fallback: first 3 alphanumeric letters of the team name.
      code = name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
    }
    const prev = usedCodes.get(code) ?? 0;
    if (prev > 0) code = `${code}${String(prev + 1)}`;
    usedCodes.set(code, prev + 1);
    teams.push({ code, name, group: letter });
  }
}

if (teams.length !== 48) {
  process.stderr.write(
    `seed-teams: expected 48 teams, got ${String(teams.length)} — openfootball schema may have changed\n`,
  );
  process.exit(1);
}

const out = {
  tournament: "FIFA World Cup 2026",
  _note:
    "Auto-generated from openfootball/worldcup.json by scripts/seed-teams.ts. Do not edit by hand — runs on `prebuild` and `predev`.",
  generatedAt: new Date().toISOString(),
  teams,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`, "utf8");

process.stderr.write(
  `seed-teams: wrote ${String(teams.length)} teams across ${String(groupTeams.size)} groups → ${outPath}\n`,
);
if (unknown.length > 0) {
  process.stderr.write(
    `seed-teams: ${String(unknown.length)} team(s) used a fallback code — add to FIFA_CODES if you care: ${unknown.join(", ")}\n`,
  );
}
