import { spawn, spawnSync } from "node:child_process";

export type VercelEnv = "production" | "preview" | "development";

export const ALL_ENVS: readonly VercelEnv[] = [
  "production",
  "preview",
  "development",
];

/** Ensure the Vercel CLI is installed and the project is linked. */
export function ensureVercelReady(): void {
  const which = spawnSync("vercel", ["--version"], { stdio: "ignore" });
  if (which.status !== 0) {
    throw new Error(
      "vercel CLI not found. Install with `npm i -g vercel` and run `vercel login`.",
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
  spawnSync("vercel", ["env", "rm", name, env, "-y"], {
    stdio: ["ignore", "ignore", "ignore"],
  });

  await new Promise<void>((res, rej) => {
    const child = spawn("vercel", ["env", "add", name, env], {
      stdio: ["pipe", "inherit", "inherit"],
    });
    child.on("error", rej);
    child.on("exit", (code) => {
      if (code === 0) res();
      else rej(new Error(`vercel env add ${name} ${env} exited with ${String(code)}`));
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
