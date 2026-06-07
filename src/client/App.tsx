import { type JSX, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  FIXTURE_STAGE_LABELS,
  type FixtureStage,
} from "../core/fixture-stages.ts";
import {
  type Fixture,
  type LeaderboardEntry,
  type LiveMatch,
} from "../core/types.ts";
import {
  api,
  type FixturesResponse,
  type LeaderboardResponse,
  type LiveMatchesResponse,
  type Owners,
  type StandingsResponse,
} from "./api.ts";

const STAGE_ORDER = Object.keys(FIXTURE_STAGE_LABELS) as FixtureStage[];
const STAGE_NUM: Record<FixtureStage, string> = {
  GROUP: "I",
  R32: "II",
  R16: "III",
  QF: "IV",
  SF: "V",
  THIRD: "—",
  FINAL: "VI",
};

// All times rendered in UK time — sweepstakes audience is UK-based.
// Europe/London handles BST/GMT automatically.
const UK_TZ = "Europe/London";
const UK_LOCALE = "en-GB";

// Configurable at build time via VITE_GROUP_NAME (e.g. "Family").
const RAW_GROUP_NAME =
  (import.meta.env.VITE_GROUP_NAME as string | undefined)?.trim() ?? "";
const GROUP_NAME = RAW_GROUP_NAME.length > 0 ? RAW_GROUP_NAME : "Family";

export function App(): JSX.Element {
  const [liveQ, leaderboardQ, fixturesQ, standingsQ] = useQueries({
    queries: [
      { queryKey: ["live"], queryFn: api.live, refetchInterval: 30_000 },
      {
        queryKey: ["leaderboard"],
        queryFn: api.leaderboard,
        refetchInterval: 60_000,
      },
      {
        queryKey: ["fixtures"],
        queryFn: api.fixtures,
        refetchInterval: 120_000,
      },
      {
        queryKey: ["standings"],
        queryFn: api.standings,
        refetchInterval: 120_000,
      },
    ],
  });

  const meta =
    leaderboardQ.data ?? liveQ.data ?? fixturesQ.data ?? standingsQ.data;
  const anyError = leaderboardQ.error ?? liveQ.error;

  return (
    <main className="page">
      <Masthead meta={meta} liveCount={liveQ.data?.matches.length ?? 0} />

      {anyError && <div className="error-box block">{anyError.message}</div>}

      <LiveMatchesBlock data={liveQ.data} isLoading={liveQ.isLoading} />

      <LeaderboardBlock
        data={leaderboardQ.data}
        isLoading={leaderboardQ.isLoading}
      />

      <DetailsBlock fixtures={fixturesQ.data} standings={standingsQ.data} />

      <footer className="colophon">
        <span>{GROUP_NAME} World Cup Sweepstakes · MMXXVI</span>
        <span>
          Source ·{" "}
          <em style={{ color: "var(--copa)", fontStyle: "normal" }}>
            {meta?.source ?? "—"}
          </em>
        </span>
      </footer>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Masthead
// ---------------------------------------------------------------------------

function Masthead({
  meta,
  liveCount,
}: {
  meta:
    | LeaderboardResponse
    | LiveMatchesResponse
    | FixturesResponse
    | StandingsResponse
    | undefined;
  liveCount: number;
}): JSX.Element {
  return (
    <header className="masthead">
      <div>
        <div className="brand">
          <span className="dot" />
          <span>The {GROUP_NAME} Cup · A 2026 Sweepstakes</span>
        </div>
        <h1 className="wordmark">
          <span className="group-line">{GROUP_NAME}</span>
          World Cup
          <br />
          <span className="alt">Sweepstakes</span>
          <span className="year">FIFA WORLD CUP · 2026 · USA · CAN · MEX</span>
        </h1>
      </div>
      <div className="masthead-meta">
        <dl>
          <div>
            <dt>Live now</dt>
            <dd>
              {liveCount > 0 ? (
                <span className="live-pip">
                  {String(liveCount)} match{liveCount === 1 ? "" : "es"}
                </span>
              ) : (
                <span style={{ color: "var(--smoke)" }}>None</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>
              <span className="accent">{meta?.source ?? "—"}</span>
            </dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>
              {meta
                ? new Date(meta.lastUpdated).toLocaleTimeString(UK_LOCALE, {
                    timeZone: UK_TZ,
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—"}
            </dd>
          </div>
        </dl>
        {meta?.degraded && (
          <div className="badge-degraded">Degraded — cached</div>
        )}
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// LIVE — participant battles in progress
// ---------------------------------------------------------------------------

function LiveMatchesBlock({
  data,
  isLoading,
}: {
  data: LiveMatchesResponse | undefined;
  isLoading: boolean;
}): JSX.Element {
  return (
    <section className="block">
      <div className="section-head">
        <div className="section-eyebrow">
          <span>In play</span>
        </div>
        <h2 className="section-title">
          <em>{GROUP_NAME}</em> head-to-heads
        </h2>
        <div className="section-meta">Live matches happening now</div>
      </div>

      {isLoading && <SkeletonRows count={2} height="180px" />}

      {data?.matches.length === 0 && (
        <div className="empty">
          <span className="empty-eyebrow">Quiet for now</span>
          No matches in progress.
        </div>
      )}

      {data && data.matches.length > 0 && (
        <div className="live-grid">
          {data.matches.map((m) => (
            <LiveMatchCard key={m.fixture.id} match={m} />
          ))}
        </div>
      )}
    </section>
  );
}

function LiveMatchCard({ match }: { match: LiveMatch }): JSX.Element {
  const { fixture: fx, owners } = match;
  const hasScore = fx.homeScore !== null && fx.awayScore !== null;
  const elapsed = fx.elapsed != null ? `${String(fx.elapsed)}′` : null;
  const stageLabel = FIXTURE_STAGE_LABELS[fx.stage];
  return (
    <article className="live-match">
      <header className="lm-head">
        <span className="lm-stage">
          {stageLabel}
          {fx.group && <> · Group {fx.group}</>}
        </span>
        <span className="live-pip">
          {fx.status === "halftime" ? "HT" : "LIVE"}
          {elapsed && fx.status !== "halftime" && <> · {elapsed}</>}
        </span>
      </header>

      <div className="lm-versus">
        <ParticipantSide
          participant={owners.home}
          team={fx.home.name}
          code={fx.home.code}
          resolved={fx.home.resolved}
          align="left"
        />
        <div className="lm-score">
          {hasScore ? (
            <>
              <span className="lm-score-num">{fx.homeScore}</span>
              <span className="lm-score-dash">—</span>
              <span className="lm-score-num">{fx.awayScore}</span>
            </>
          ) : (
            <span className="lm-vs">vs</span>
          )}
        </div>
        <ParticipantSide
          participant={owners.away}
          team={fx.away.name}
          code={fx.away.code}
          resolved={fx.away.resolved}
          align="right"
        />
      </div>
    </article>
  );
}

function ParticipantSide({
  participant,
  team,
  code,
  resolved,
  align,
}: {
  participant: string | null;
  team: string;
  code: string | null;
  resolved: boolean;
  align: "left" | "right";
}): JSX.Element {
  return (
    <div className={`lm-side lm-side-${align}`}>
      <div className="lm-owner">
        {participant ?? <span className="muted">unclaimed</span>}
      </div>
      <div className={`lm-team ${resolved ? "" : "placeholder"}`}>{team}</div>
      <div className="lm-code">{code ?? "—"}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LEADERBOARD
// ---------------------------------------------------------------------------

function LeaderboardBlock({
  data,
  isLoading,
}: {
  data: LeaderboardResponse | undefined;
  isLoading: boolean;
}): JSX.Element {
  return (
    <section className="block">
      <div className="section-head">
        <div className="section-eyebrow">
          <span>The standings</span>
        </div>
        <h2 className="section-title">
          Who&apos;s leading the <em>{GROUP_NAME}</em>
        </h2>
        <div className="section-meta">
          Ranked by each participant&apos;s best-placed team · winner-takes-all
        </div>
      </div>

      {isLoading && <SkeletonRows count={6} height="72px" />}

      {data && (
        <ol className="leaderboard">
          {data.leaderboard.entries.map((entry) => (
            <LeaderboardRow
              key={entry.participant}
              entry={entry}
              topScore={data.leaderboard.entries[0]?.bestRank ?? entry.bestRank}
              tailScore={
                data.leaderboard.entries[data.leaderboard.entries.length - 1]
                  ?.bestRank ?? entry.bestRank
              }
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function LeaderboardRow({
  entry,
  topScore,
  tailScore,
}: {
  entry: LeaderboardEntry;
  topScore: number;
  tailScore: number;
}): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const span = tailScore - topScore || 1;
  const norm = (entry.bestRank - topScore) / span;
  const perfWidth = `${String(Math.round((1 - norm) * 100))}%`;

  const podiumClass =
    entry.position === 1
      ? "podium-1"
      : entry.position === 2
        ? "podium-2"
        : entry.position === 3
          ? "podium-3"
          : "";

  return (
    <li className={`lb-row ${podiumClass}`} data-expanded={expanded}>
      <button
        className="lb-row-trigger"
        onClick={() => {
          setExpanded((v) => !v);
        }}
        aria-expanded={expanded}
      >
        <span className="lb-pos">
          <span className="lb-pos-num">
            {String(entry.position).padStart(2, "0")}
          </span>
        </span>
        <span className="lb-body">
          <span className="lb-name">{entry.participant}</span>
          <span className="lb-teams">
            {entry.teams.map((t, i) => (
              <span
                key={t.code}
                className={`lb-team-pip${t.eliminated ? " out" : ""}${t.champion ? " champion" : ""}`}
              >
                <span className="lb-team-code">{t.code}</span>
                <span className="lb-team-rank">#{String(t.rank)}</span>
                {i < entry.teams.length - 1 && (
                  <span className="lb-sep">·</span>
                )}
              </span>
            ))}
          </span>
          <span className="lb-bar">
            <span className="lb-bar-fill" style={{ width: perfWidth }} />
          </span>
        </span>
        <span className="lb-score">
          <span className="lb-score-num">#{String(entry.bestRank)}</span>
          <span className="lb-score-label">best team</span>
        </span>
      </button>

      {expanded && (
        <div className="lb-breakdown">
          <table>
            <thead>
              <tr>
                <th>Team</th>
                <th>Reached</th>
                <th className="num">Pts</th>
                <th className="num">GD</th>
                <th className="num">Rank</th>
              </tr>
            </thead>
            <tbody>
              {entry.teams.map((t) => (
                <tr key={t.code}>
                  <td>
                    <span className="lb-team-code lb-team-code-inline">
                      {t.code}
                    </span>
                    <span style={{ marginLeft: "0.5rem" }}>{t.name}</span>
                  </td>
                  <td className="muted">{FIXTURE_STAGE_LABELS[t.reached]}</td>
                  <td className="num">{String(t.points)}</td>
                  <td className="num">
                    {t.goalDifference > 0 ? "+" : ""}
                    {String(t.goalDifference)}
                  </td>
                  <td className="num strong">#{String(t.rank)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Details (group standings + fixtures)
// ---------------------------------------------------------------------------

function DetailsBlock({
  fixtures,
  standings,
}: {
  fixtures: FixturesResponse | undefined;
  standings: StandingsResponse | undefined;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <section className="block">
      <div className="section-head">
        <div className="section-eyebrow">
          <span>The tournament</span>
        </div>
        <h2 className="section-title">
          <em>Schedule</em> & standings
        </h2>
        <div className="section-meta">
          The raw tournament data — group tables and all 104 fixtures
        </div>
      </div>

      <button
        className="details-toggle"
        onClick={() => {
          setOpen((v) => !v);
        }}
      >
        {open ? "Hide" : "Show"} tournament details
        <span className={`chev ${open ? "open" : ""}`} />
      </button>

      {open && (
        <div className="details-content">
          {standings && (
            <div className="details-sub">
              <h3 className="details-sub-title">Group stage</h3>
              <div className="groups-grid">
                {standings.standings.map((g) => (
                  <article key={g.group} className="group-card">
                    <div className="gc-head">
                      <div className="gc-letter">{g.group}</div>
                      <div className="gc-label">Group</div>
                    </div>
                    <div className="standings-wrap">
                      <table className="standings-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Team</th>
                            <th>P</th>
                            <th>GD</th>
                            <th>Pts</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.rows.map((r) => {
                            const owner = r.teamCode
                              ? standings.owners[r.teamCode]
                              : undefined;
                            return (
                              <tr
                                key={`${g.group}-${r.teamCode ?? r.teamName}-${String(r.rank)}`}
                                className={
                                  r.rank <= 2 && r.played > 0 ? "qualified" : ""
                                }
                              >
                                <td>{r.rank}</td>
                                <td>
                                  <span className="team-name">
                                    {r.teamName}
                                  </span>
                                  {owner && (
                                    <span className="team-owner">{owner}</span>
                                  )}
                                </td>
                                <td>{r.played}</td>
                                <td
                                  className={
                                    r.goalDifference > 0
                                      ? "gd-pos"
                                      : r.goalDifference < 0
                                        ? "gd-neg"
                                        : ""
                                  }
                                >
                                  {r.goalDifference > 0 ? "+" : ""}
                                  {r.goalDifference}
                                </td>
                                <td className="pts">{r.points}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {fixtures && <FixturesList data={fixtures} />}
        </div>
      )}
    </section>
  );
}

function FixturesList({ data }: { data: FixturesResponse }): JSX.Element {
  const grouped = useMemo(() => groupByStage(data.fixtures), [data]);
  return (
    <div className="details-sub">
      <h3 className="details-sub-title">Fixtures</h3>
      {grouped.map(([stage, list]) => (
        <StageSection
          key={stage}
          stage={stage}
          fixtures={list}
          owners={data.owners}
        />
      ))}
    </div>
  );
}

function StageSection({
  stage,
  fixtures,
  owners,
}: {
  stage: FixtureStage;
  fixtures: Fixture[];
  owners: Owners;
}): JSX.Element {
  const [open, setOpen] = useState(stage === "GROUP");
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? fixtures : fixtures.slice(0, 12);
  const hidden = fixtures.length - visible.length;

  return (
    <div className="stage-section" data-open={open}>
      <button
        className="stage-trigger"
        onClick={() => {
          setOpen((v) => !v);
        }}
      >
        <span className="stage-num">{STAGE_NUM[stage]}</span>
        <span className="stage-name">{FIXTURE_STAGE_LABELS[stage]}</span>
        <span className="stage-count">
          {String(fixtures.length)} match{fixtures.length === 1 ? "" : "es"}
          <span className="chev" />
        </span>
      </button>
      {open && (
        <div className="stage-fixtures">
          {visible.map((fx) => (
            <FixtureRow key={fx.id} fx={fx} owners={owners} />
          ))}
          {hidden > 0 && (
            <button
              className="show-more"
              onClick={() => {
                setExpanded(true);
              }}
            >
              Show {String(hidden)} more
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FixtureRow({
  fx,
  owners,
}: {
  fx: Fixture;
  owners: Owners;
}): JSX.Element {
  const hasScore = fx.homeScore !== null && fx.awayScore !== null;
  const homeOwner = fx.home.code ? owners[fx.home.code] : undefined;
  const awayOwner = fx.away.code ? owners[fx.away.code] : undefined;
  const date = new Date(fx.kickoff);
  const dateLabel = date.toLocaleDateString(UK_LOCALE, {
    timeZone: UK_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeLabel = date.toLocaleTimeString(UK_LOCALE, {
    timeZone: UK_TZ,
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={`fixture-row status-${fx.status}`}>
      <div className="when">
        <span className="date">{dateLabel}</span>
        <span className="time">{timeLabel}</span>
      </div>
      <div className={`team-home${fx.home.resolved ? "" : " placeholder"}`}>
        <span className="team-block">
          <span className="name">{fx.home.name}</span>
          {homeOwner && <span className="team-owner">{homeOwner}</span>}
        </span>
        <span className="code">{fx.home.code ?? "—"}</span>
      </div>
      <div className={`center ${hasScore ? "score" : ""}`}>
        {hasScore ? (
          <>
            {fx.homeScore}
            <span className="dash"> – </span>
            {fx.awayScore}
          </>
        ) : (
          <span style={{ color: "var(--smoke)" }}>vs</span>
        )}
      </div>
      <div className={`team-away${fx.away.resolved ? "" : " placeholder"}`}>
        <span className="code">{fx.away.code ?? "—"}</span>
        <span className="team-block">
          <span className="name">{fx.away.name}</span>
          {awayOwner && <span className="team-owner">{awayOwner}</span>}
        </span>
      </div>
      <div className="meta">
        {fx.status === "live" || fx.status === "halftime" ? (
          <span className="status-label live">
            {fx.status === "halftime"
              ? "HT"
              : `LIVE${fx.elapsed != null ? ` ${String(fx.elapsed)}′` : ""}`}
          </span>
        ) : fx.status === "finished" ? (
          <span className="status-label ft">FT</span>
        ) : null}
        {fx.group && <span className="group-tag">Group {fx.group}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function SkeletonRows({
  count,
  height,
}: {
  count: number;
  height: string;
}): JSX.Element {
  return (
    <div className="skeleton-rows">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skel" style={{ height }} />
      ))}
    </div>
  );
}

function groupByStage(
  fixtures: readonly Fixture[],
): [FixtureStage, Fixture[]][] {
  const byStage = new Map<FixtureStage, Fixture[]>();
  for (const fx of fixtures) {
    const list = byStage.get(fx.stage) ?? [];
    list.push(fx);
    byStage.set(fx.stage, list);
  }
  return STAGE_ORDER.filter((s) => byStage.has(s)).map((s) => [
    s,
    byStage.get(s) ?? [],
  ]);
}
