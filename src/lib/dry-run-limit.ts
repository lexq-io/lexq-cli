import { MAX_DRY_RUN_EVALUATIONS_PER_MINUTE } from '@/types/constants';

/**
 * The limit that dry runs, dry run compares, and single-decision replays share. The CLI help and
 * the MCP tool descriptions of all three print this one sentence, and the number comes from the
 * engine manifest.
 */
export const DRY_RUN_LIMIT_NOTE = `Not billed and not counted toward the plan's usage. Dry runs, dry run compares, and single-decision replays share a limit of ${MAX_DRY_RUN_EVALUATIONS_PER_MINUTE} evaluations per minute for each organization; a compare counts as two. Past the limit, a call fails with 429 (C-007) until the next minute starts.`;
