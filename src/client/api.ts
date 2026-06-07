import {
  type Fixture,
  type GroupStanding,
  type Leaderboard,
  type LiveMatch,
} from "../core/types";

interface ResponseEnvelope {
  lastUpdated: string;
  source: string;
  degraded: boolean;
}

/** Mapping of team code → participant name (the group member who drew that team). */
export type Owners = Record<string, string>;

export type FixturesResponse = ResponseEnvelope & {
  fixtures: Fixture[];
  owners: Owners;
};
export type StandingsResponse = ResponseEnvelope & {
  standings: GroupStanding[];
  owners: Owners;
};
export type LiveMatchesResponse = ResponseEnvelope & {
  matches: LiveMatch[];
};
export type LeaderboardResponse = ResponseEnvelope & {
  leaderboard: Leaderboard;
};

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => ({}));
    const message =
      typeof body === "object" && body !== null && "error" in body
        ? String((body).error)
        : `request failed: ${String(res.status)}`;
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export const api = {
  leaderboard: () => getJson<LeaderboardResponse>("/api/results/leaderboard"),
  live: () => getJson<LiveMatchesResponse>("/api/results/live"),
  fixtures: () => getJson<FixturesResponse>("/api/results/fixtures"),
  standings: () => getJson<StandingsResponse>("/api/results/standings"),
};
