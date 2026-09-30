/**
 * How the server reads date and time inputs, written once for every option and tool that takes
 * one.
 *
 * A `yyyy-MM-dd` filter is a whole calendar day in the organization's time zone, not UTC and not
 * the caller's machine zone. For an organization in Asia/Seoul, 2026-09-29 runs from
 * 2026-09-28T15:00Z to 2026-09-29T15:00Z. `whoami` returns that zone as `tenantTimezone`, so an
 * agent can work out "yesterday" for the organization rather than for itself.
 *
 * An instant (`effectiveFrom`, `effectiveTo`) needs `Z` or an offset. The server rejects a bare
 * date or a time without an offset rather than guess a zone for it.
 */
const ORG_DAY =
  'yyyy-MM-dd, a whole calendar day in the organization time zone (tenantTimezone in whoami), not UTC';

export const START_DAY = `Start date, ${ORG_DAY}. Inclusive.`;
export const END_DAY = `End date, ${ORG_DAY}. Inclusive: the whole day counts.`;
export const WINDOW_START_DAY = `Window start date, ${ORG_DAY}. Inclusive.`;
export const WINDOW_END_DAY = `Window end date, ${ORG_DAY}. Inclusive: the whole day counts.`;

export const INSTANT =
  'ISO-8601 instant with Z or an offset, e.g. 2026-10-01T00:00:00Z or 2026-10-01T09:00:00+09:00. A bare date or a time without an offset is rejected.';

/**
 * The server's default windows for execution stats and failure logs, and its limit for stats. The
 * contract manifest does not carry them yet, so they are typed here once, and the CLI help and the
 * MCP descriptions both read them from here.
 */
export const STATS_DEFAULT_WINDOW_DAYS = 30;
export const STATS_MAX_WINDOW_DAYS = 31;
export const FAILURE_LOG_LOOKBACK_DAYS = 7;

/**
 * A server instant for a human-readable table: cut to the minute, kept in UTC, with the `Z` left
 * on. Without it, 2026-09-30T15:00 reads as local time, and for Seoul that is nine hours off.
 */
export function utcMinute(instant: string | null | undefined): string {
  return instant ? `${new Date(instant).toISOString().substring(0, 16)}Z` : '–';
}
