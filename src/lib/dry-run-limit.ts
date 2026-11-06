import {
  MAX_DRY_RUN_EVALUATIONS_PER_DAY,
  MAX_DRY_RUN_EVALUATIONS_PER_MINUTE,
} from '@/types/constants';

/**
 * The limits that dry runs, dry run compares, and single-decision replays share. The CLI help and
 * the MCP tool descriptions of all three print this one note, and the numbers come from the
 * engine manifest.
 */
export const DRY_RUN_LIMIT_NOTE = `Not billed and not counted toward the plan's usage. Dry runs, dry run compares, and single-decision replays share two limits for each organization: ${MAX_DRY_RUN_EVALUATIONS_PER_MINUTE} evaluations per minute and ${MAX_DRY_RUN_EVALUATIONS_PER_DAY} per UTC day; a compare counts as two. Past the per-minute limit, a call fails with 429 (C-007); wait a minute before trying again. Past the daily limit, a call fails with 429 (AN-041) until 00:00 UTC. A call refused by the per-minute limit does not count toward the daily limit.`;
