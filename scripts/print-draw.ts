#!/usr/bin/env tsx
/**
 * Print the current draw, one participant per line with their team names.
 *
 * Usage:
 *   tsx scripts/print-draw.ts [--draw <path>] [--teams <path>]
 *
 * Defaults:
 *   --draw   ./draw.yaml
 *   --teams  ./data/tournament-teams.json
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TournamentTeamsFileSchema } from "../src/core/schemas";
import { parseDraw } from "../src/core/yaml";
import { die, parseArgs } from "./lib/cli";

const { flags } = parseArgs(process.argv.slice(2));

const drawPath = resolve(flags.draw ?? "draw.yaml");
const teamsPath = resolve(flags.teams ?? "data/tournament-teams.json");

let drawText: string;
try {
  drawText = readFileSync(drawPath, "utf8");
} catch {
  die(`could not read ${drawPath} — run \`npm run draw\` first`);
}

let teamsText: string;
try {
  teamsText = readFileSync(teamsPath, "utf8");
} catch {
  die(
    `could not read ${teamsPath} — run \`npm run seed:teams\` (or \`npm run dev\`) first`,
  );
}

const draws = parseDraw(drawText);
const teamsFile = TournamentTeamsFileSchema.parse(
  JSON.parse(teamsText) as unknown,
);

const nameByCode = new Map(teamsFile.teams.map((t) => [t.code, t.name]));

const longestName = Math.max(...draws.map((d) => d.participant.length));

for (const draw of draws) {
  const names = draw.teams.map((code) => nameByCode.get(code) ?? `?${code}`);
  process.stdout.write(
    `${draw.participant.padEnd(longestName)}  ${names.join(", ")}\n`,
  );
}
