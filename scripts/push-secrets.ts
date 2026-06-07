#!/usr/bin/env tsx
/**
 * Push local secrets to Vercel (production + preview + development).
 *
 * Sources:
 *   TEAMS_YAML       ← ./teams.yaml
 *   DRAW_YAML        ← ./draw.yaml
 *   PROVIDER_API_KEY ← $PROVIDER_API_KEY (or --provider-key <value>)
 *
 * Anything without a source is skipped. Requires `vercel login` and
 * `vercel link` to have been run.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "./lib/cli.js";
import { ensureVercelReady, setVercelEnvAll } from "./lib/vercel.js";

const { flags } = parseArgs(process.argv.slice(2));

ensureVercelReady();

const tasks: { name: string; value: string; from: string }[] = [];

const teamsPath = resolve(flags.participants ?? "teams.yaml");
if (existsSync(teamsPath)) {
  tasks.push({
    name: "TEAMS_YAML",
    value: readFileSync(teamsPath, "utf8"),
    from: teamsPath,
  });
}

const drawPath = resolve(flags.draw ?? "draw.yaml");
if (existsSync(drawPath)) {
  tasks.push({
    name: "DRAW_YAML",
    value: readFileSync(drawPath, "utf8"),
    from: drawPath,
  });
}

const providerKey = flags["provider-key"] ?? process.env.PROVIDER_API_KEY;
if (providerKey) {
  tasks.push({
    name: "PROVIDER_API_KEY",
    value: providerKey,
    from: flags["provider-key"] ? "--provider-key" : "$PROVIDER_API_KEY",
  });
}

if (tasks.length === 0) {
  process.stderr.write(
    "no secrets to push (no teams.yaml, no draw.yaml, no PROVIDER_API_KEY)\n",
  );
  process.exit(0);
}

for (const task of tasks) {
  process.stderr.write(`pushing ${task.name} (from ${task.from}) → all envs\n`);
  await setVercelEnvAll(task.name, task.value);
}

process.stderr.write("done.\n");
