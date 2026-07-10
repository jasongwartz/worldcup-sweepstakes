import {
  type Fixture,
  type GroupStanding,
  type ResultsSourceName,
  type Team,
} from "../../core/types.js";

/**
 * A ResultsSource normalizes one upstream API into our wire shape. The cache,
 * routes, and downstream scoring all depend only on this interface — never on
 * a specific source's response format. Add a new file in this directory and
 * register it in `source.ts` to plug in a new upstream.
 */
export interface ResultsSource {
  readonly name: ResultsSourceName;
  /**
   * Whether this source can report in-play state (live/halftime statuses,
   * elapsed minutes). Sources that only publish finished results should set
   * this to false so the UI can hide live-only sections instead of showing
   * a permanently empty "no live matches" state.
   */
  readonly supportsLive: boolean;
  /**
   * `teams` is our tournament team list. Sources use it to map their
   * upstream team names back to our team codes.
   */
  getFixtures(input: { teams: readonly Team[] }): Promise<Fixture[]>;
  getStandings(input: { teams: readonly Team[] }): Promise<GroupStanding[]>;
}
