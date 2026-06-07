import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export type VercelEnv = "production" | "preview" | "development";

export const ALL_ENVS: readonly VercelEnv[] = [
  "production",
  "preview",
  "development",
];

/**
 * Path to the locally-installed Vercel CLI binary. Pinned as a devDependency
 * so contributors don't need a global install or `vercel login` recipe drift
 * between machines.
 */
const VERCEL_BIN = resolve("node_modules", ".bin", "vercel");

/** Ensure the local Vercel CLI is installed (we depend on a specific version). */
export function ensureVercelReady(): void {
  if (!existsSync(VERCEL_BIN)) {
    throw new Error(
      `vercel CLI not found at ${VERCEL_BIN}. Run \`npm install\` to install it (it's a devDependency).`,
    );
  }
  const which = spawnSync(VERCEL_BIN, ["--version"], { stdio: "ignore" });
  if (which.status !== 0) {
    throw new Error(
      `vercel CLI at ${VERCEL_BIN} failed to run. Reinstall with \`npm install\`.`,
    );
  }
}

/**
 * Idempotently set an env var on Vercel by removing any existing one
 * (best-effort) and then piping the new value to `vercel env add` via stdin.
 */
export async function setVercelEnv(
  name: string,
  value: string,
  env: VercelEnv,
): Promise<void> {
  spawnSync(VERCEL_BIN, ["env", "rm", name, env, "-y"], {
    stdio: ["ignore", "ignore", "ignore"],
  });

  await new Promise<void>((res, rej) => {
    const child = spawn(VERCEL_BIN, ["env", "add", name, env], {
      stdio: ["pipe", "inherit", "inherit"],
    });
    child.on("error", rej);
    child.on("exit", (code) => {
      if (code === 0) res();
      else
        rej(
          new Error(`vercel env add ${name} ${env} exited with ${String(code)}`),
        );
    });
    child.stdin.write(value);
    child.stdin.end();
  });
}

export async function setVercelEnvAll(
  name: string,
  value: string,
): Promise<void> {
  for (const env of ALL_ENVS) {
    await setVercelEnv(name, value, env);
  }
}
