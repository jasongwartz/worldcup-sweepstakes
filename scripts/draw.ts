#!/usr/bin/env tsx
/**
 * Draw teams to participants.
 *
 * Usage:
 *   tsx scripts/draw.ts [--seed <string>] [--out <path>] [--participants <yaml>] [--teams <json>]
 *
 * Defaults:
 *   --participants ./teams.yaml
 *   --teams        ./data/tournament-teams.json
 *   --out          ./draw.yaml      (use `-` for stdout)
 *   --seed         random           (printed so the draw is reproducible)
 */
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseParticipants, stringifyDraw } from "../src/core/yaml";
import { TournamentTeamsFileSchema } from "../src/core/schemas";
import { parseArgs } from "./lib/cli";
import { seededRandom, shuffle } from "./lib/random";

const { flags } = parseArgs(process.argv.slice(2));

const participantsPath = resolve(flags.participants ?? "teams.yaml");
const teamsPath = resolve(flags.teams ?? "data/tournament-teams.json");
const outPath = flags.out ?? "draw.yaml";
const seed = flags.seed ?? randomBytes(8).toString("hex");

const participants = parseParticipants(readFileSync(participantsPath, "utf8"));
const teamsFile = TournamentTeamsFileSchema.parse(
  JSON.parse(readFileSync(teamsPath, "utf8")) as unknown,
);

// All teams must be assigned. Uneven distribution is fine — round-robin
// hands the remainder out one team at a time, so any extras get spread
// across the earliest participants in the shuffle.
const teamsPerParticipant = teamsFile.teams.length / participants.length;
const rand = seededRandom(seed);
const shuffledTeams = shuffle(teamsFile.teams, rand);
const shuffledParticipants = shuffle(participants, rand);

const assignments: Record<string, string[]> = {};
for (const name of shuffledParticipants) {
  assignments[name] = [];
}

shuffledTeams.forEach((team, idx) => {
  const owner = shuffledParticipants[idx % shuffledParticipants.length];
  if (owner === undefined) return;
  const list = assignments[owner];
  if (list) list.push(team.code);
});

// Sort each participant's teams alphabetically for readable output.
for (const name of Object.keys(assignments)) {
  assignments[name]?.sort();
}

const yamlOut = stringifyDraw(assignments, {
  seed,
  drawnAt: new Date().toISOString(),
});

if (outPath === "-") {
  process.stdout.write(yamlOut);
} else {
  writeFileSync(resolve(outPath), yamlOut, "utf8");
  process.stderr.write(
    `wrote draw to ${outPath} (seed: ${seed}, ${String(participants.length)} participants, ${String(teamsFile.teams.length)} teams, ~${teamsPerParticipant.toFixed(1)} each)\n`,
  );
}
