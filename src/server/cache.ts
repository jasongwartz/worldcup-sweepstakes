import { Redis } from "@upstash/redis";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface CacheEntry<T> {
  data: T;
  lastUpdated: string;
}

export interface Cache {
  readonly kind: "upstash" | "file";
  get<T>(key: string): Promise<CacheEntry<T> | null>;
  set<T>(key: string, value: CacheEntry<T>): Promise<void>;
}

class UpstashCache implements Cache {
  readonly kind = "upstash" as const;
  constructor(private readonly redis: Redis) {}

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    // @upstash/redis auto-parses JSON when the stored value is a string,
    // so a stored object comes back already typed as `unknown`.
    const raw = await this.redis.get<CacheEntry<T>>(key);
    return raw ?? null;
  }

  async set<T>(key: string, value: CacheEntry<T>): Promise<void> {
    await this.redis.set(key, value);
  }
}

class FileCache implements Cache {
  readonly kind = "file" as const;
  constructor(private readonly path: string) {}

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const all = await this.readAll();
    const entry = all[key];
    return (entry as CacheEntry<T> | undefined) ?? null;
  }

  async set<T>(key: string, value: CacheEntry<T>): Promise<void> {
    const all = await this.readAll();
    all[key] = value;
    await writeFile(this.path, JSON.stringify(all, null, 2), "utf8");
  }

  private async readAll(): Promise<Record<string, unknown>> {
    try {
      const text = await readFile(this.path, "utf8");
      return JSON.parse(text) as Record<string, unknown>;
    } catch (err) {
      if (
        err instanceof Error &&
        "code" in err &&
        (err as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        return {};
      }
      throw err;
    }
  }
}

export function createCache(env: NodeJS.ProcessEnv): Cache {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    return new UpstashCache(new Redis({ url, token }));
  }
  const path = env.CACHE_LOCAL_PATH ?? ".cache.local.json";
  return new FileCache(resolve(path));
}
