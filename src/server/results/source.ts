import { type ResultsSourceName } from "../../core/types.js";
import { apiFootballSource } from "./api-football.js";
import { demoSource } from "./demo.js";
import { openFootballSource } from "./openfootball.js";
import { type ResultsSource } from "./types.js";

export type ConfiguredSource = ResultsSourceName | "demo";

export interface ResultsConfig {
  source: ConfiguredSource;
  ttlSeconds: number;
  apiFootballKey: string | null;
  apiFootballSeason: number;
}

export function readResultsConfig(env: NodeJS.ProcessEnv): ResultsConfig {
  const rawSource = env.RESULTS_SOURCE?.toLowerCase().trim();
  const source: ConfiguredSource =
    rawSource === "api-football"
      ? "api-football"
      : rawSource === "demo"
        ? "demo"
        : "openfootball";
  return {
    source,
    ttlSeconds: Number(env.RESULTS_TTL_SECONDS ?? 120),
    apiFootballKey: env.API_FOOTBALL_KEY ?? null,
    apiFootballSeason: Number(env.API_FOOTBALL_SEASON ?? 2026),
  };
}

/**
 * Resolve the active source. If `RESULTS_SOURCE=api-football` but the key is
 * missing, fall back to openfootball — the app must still function on either
 * source alone (per spec).
 */
export function selectResultsSource(config: ResultsConfig): ResultsSource {
  if (config.source === "demo") return demoSource;
  if (config.source === "api-football" && config.apiFootballKey) {
    return apiFootballSource({
      apiKey: config.apiFootballKey,
      season: config.apiFootballSeason,
    });
  }
  return openFootballSource;
}
