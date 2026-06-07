#!/usr/bin/env tsx
/**
 * Push a local env file (default `.env.production`) to Vercel in one shot,
 * so you don't have to click through the dashboard for each var.
 *
 * Usage:
 *   tsx scripts/push-env.ts [--from <path>] [--env <production|preview|development|all>]
 *
 * Defaults:
 *   --from  .env.production
 *   --env   production
 *
 * Format: one KEY=VALUE per line, # comments OK, blank lines skipped.
 * Quoted values have their outer quotes stripped. Empty values are skipped
 * (rather than pushed as empty strings).
 *
 * For multi-line secrets (TEAMS_YAML, DRAW_YAML) use `npm run push-secrets`
 * instead — it reads them straight from their YAML files.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { die, parseArgs } from "./lib/cli";
import {
  ALL_ENVS,
  ensureVercelReady,
  setVercelEnv,
  setVercelEnvAll,
  type VercelEnv,
} from "./lib/vercel";

const { flags } = parseArgs(process.argv.slice(2));

const fromPath = resolve(flags.from ?? ".env.production");
const envFlag = flags.env ?? "production";

const envs: VercelEnv[] =
  envFlag === "all"
    ? Array.from(ALL_ENVS)
    : envFlag === "production" || envFlag === "preview" || envFlag === "development"
      ? [envFlag]
      : die(
          `--env must be one of production, preview, development, all (got "${envFlag}")`,
        );

let text: string;
try {
  text = readFileSync(fromPath, "utf8");
} catch {
  die(
    `could not read ${fromPath} — create it with KEY=VALUE lines, or pass --from <path>`,
  );
}

const entries = parseEnvFile(text);
const targets = Object.entries(entries).filter(([, value]) => value.length > 0);

if (targets.length === 0) {
  process.stderr.write(`nothing to push: ${fromPath} has no non-empty values\n`);
  process.exit(0);
}

ensureVercelReady();

process.stderr.write(
  `pushing ${String(targets.length)} var(s) from ${fromPath} → ${envs.join(", ")}\n`,
);

for (const [name, value] of targets) {
  if (envs.length === ALL_ENVS.length) {
    process.stderr.write(`  ${name} → all envs\n`);
    await setVercelEnvAll(name, value);
  } else {
    for (const env of envs) {
      process.stderr.write(`  ${name} → ${env}\n`);
      await setVercelEnv(name, value, env);
    }
  }
}

process.stderr.write("done.\n");

function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}
