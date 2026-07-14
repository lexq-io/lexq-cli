import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CallApi } from './_shared';

/** §28.4 relative-threshold philosophy — surfaced verbatim on every profile tool. */
const RELATIVE_THRESHOLD =
  'flagged = p50 ≥ 10× median of per-rule p50s within the group; absolute thresholds are intentionally not supported.';

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
        ' Every percentile is accompanied by its sample count n; percentiles are withheld (null) when n < 100, and baselines report INSUFFICIENT_COHORT when fewer than 3 rules qualify. Rule detail comes from a deterministic 1% sample of calls; TOTAL is recorded for every call. Defaults: last 24h, live version, cacheState HIT.',
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
          .describe('Window start, ISO-8601 instant (e.g. 2026-07-01T00:00:00Z). Default: 24h ago'),
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
        "Single-rule latency detail: merged phase × cacheState distributions plus a per-window time series (60s windows). Missing windows are genuine gaps — never interpolated. Series points carry each window's own values; percentiles in merged distributions are withheld (null) when n < 100. " +
        RELATIVE_THRESHOLD,
      inputSchema: {
        groupId: z.string().uuid().describe('Policy group ID'),
        ruleId: z.string().uuid().describe('Rule ID (from lexq_profile_overview)'),
        versionId: z
          .string()
          .uuid()
          .optional()
          .describe('Version to inspect (default: live version)'),
        from: z.string().optional().describe('Window start, ISO-8601 instant. Default: 24h ago'),
        to: z.string().optional().describe('Window end, ISO-8601 instant. Default: now'),
      },
    },
    async ({ groupId, ruleId, versionId, from, to }) =>
      callApi('GET', `policy-groups/${groupId}/profile/rules/${ruleId}`, {
        params: profileParams({ versionId, from, to }),
      }),
  );
}
