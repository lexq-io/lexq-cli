import {
  LATENCY_WINDOW_MILLIS,
  MIN_COHORT_SIZE,
  MIN_SAMPLES,
  PROFILE_DEFAULT_WINDOW_HOURS,
  PROFILE_SAMPLE_PERMILLE,
  SLOW_MULTIPLIER,
  TAIL_MIN_OBS,
} from '@/types/constants';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CallApi } from './_shared';

/** §28.4 relative-threshold philosophy — surfaced verbatim on every profile tool. */
const RELATIVE_THRESHOLD = `flagged = p50 ≥ ${SLOW_MULTIPLIER}× median of per-rule p50s within the group; absolute thresholds are intentionally not supported.`;

function profileParams(opts: {
  versionId?: string;
  from?: string;
  to?: string;
  cacheState?: string;
}): Record<string, string> {
  const params: Record<string, string> = {};
  if (opts.versionId) params.versionId = opts.versionId;
  if (opts.from) params.from = opts.from;
  if (opts.to) params.to = opts.to;
  if (opts.cacheState) params.cacheState = opts.cacheState;
  return params;
}

export function registerProfileTools(server: McpServer, callApi: CallApi): void {
  server.registerTool(
    'lexq_profile_overview',
    {
      title: 'Group Latency Profile',
      description:
        'Per-rule latency profile of a policy group over a time window: group TOTAL distribution split by cache state (HIT = compiled ruleset cache hit, MISS = deep-load + compile), a per-rule CONDITION/ACTION percentile table, and slow-rule flags. ' +
        RELATIVE_THRESHOLD +
        ` Every percentile is accompanied by its sample count n; a percentile is withheld (null) unless n×(1−q) ≥ ${TAIL_MIN_OBS} (p50 needs n ≥ 6, p95 n ≥ 60, p99 n ≥ 300 — display gate, separate from the n ≥ ${MIN_SAMPLES} judgment gate). Baselines report INSUFFICIENT_COHORT when fewer than ${MIN_COHORT_SIZE} rules qualify. Rule detail comes from a deterministic ${PROFILE_SAMPLE_PERMILLE / 10}% sample of calls; TOTAL is recorded for every call. Defaults: last ${PROFILE_DEFAULT_WINDOW_HOURS}h, live version, cacheState HIT.`,
      inputSchema: {
        groupId: z.string().uuid().describe('Policy group ID'),
        versionId: z
          .string()
          .uuid()
          .optional()
          .describe('Version to inspect (default: live version)'),
        from: z
          .string()
          .optional()
          .describe(
            `Window start, ISO-8601 instant (e.g. 2026-07-01T00:00:00Z). Default: ${PROFILE_DEFAULT_WINDOW_HOURS}h ago`,
          ),
        to: z.string().optional().describe('Window end, ISO-8601 instant. Default: now'),
        cacheState: z
          .enum(['HIT', 'MISS'])
          .optional()
          .describe('Cache dimension for the rule table and judgment (default: HIT)'),
      },
    },
    async ({ groupId, versionId, from, to, cacheState }) =>
      callApi('GET', `policy-groups/${groupId}/profile`, {
        params: profileParams({ versionId, from, to, cacheState }),
      }),
  );

  server.registerTool(
    'lexq_profile_rule',
    {
      title: 'Rule Latency Detail',
      description:
        `Single-rule latency detail: merged phase × cacheState distributions plus a per-window time series (${LATENCY_WINDOW_MILLIS / 1000}s windows). Missing windows are genuine gaps — never interpolated. Series points carry each window's own values; percentiles in merged distributions are withheld (null) unless n×(1−q) ≥ ${TAIL_MIN_OBS} (p50 n ≥ 6, p95 n ≥ 60, p99 n ≥ 300). ` +
        RELATIVE_THRESHOLD,
      inputSchema: {
        groupId: z.string().uuid().describe('Policy group ID'),
        ruleId: z.string().uuid().describe('Rule ID (from lexq_profile_overview)'),
        versionId: z
          .string()
          .uuid()
          .optional()
          .describe('Version to inspect (default: live version)'),
        from: z
          .string()
          .optional()
          .describe(
            `Window start, ISO-8601 instant. Default: ${PROFILE_DEFAULT_WINDOW_HOURS}h ago`,
          ),
        to: z.string().optional().describe('Window end, ISO-8601 instant. Default: now'),
      },
    },
    async ({ groupId, ruleId, versionId, from, to }) =>
      callApi('GET', `policy-groups/${groupId}/profile/rules/${ruleId}`, {
        params: profileParams({ versionId, from, to }),
      }),
  );
}
