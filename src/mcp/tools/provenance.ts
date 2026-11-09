import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { CallApi } from './_shared';
import { READ_ONLY, paginationParams } from './_shared';
import { END_DAY, START_DAY } from '@/lib/dates';
import { withNotes } from '@/lib/enum-notes';
import type { LineageUnavailableReason } from '@/types/enums';

const UNAVAILABLE_REASON_NOTES = {
  COMPOSITE_EXECUTION:
    'a composite execution ran several groups in one request, so there is no single version or deployment and all three layers are null',
  NOT_LIVE_VERSION:
    "the version that ran, such as an A/B test or fallback version, was not the live deployment's version at that moment, so deployed is null",
  NOT_RECORDED:
    'a layer is null and the record does not say why, usually because the decision was recorded before LexQ began storing reasons',
} satisfies Record<LineageUnavailableReason, string>;

/**
 * Decision Provenance tools — read-only lineage + reveal audit ledger.
 *
 * Revealing a masked PII value is deliberately not a tool. It would put the plaintext into
 * the calling agent's context, so revealing stays in the console. Do not add a reveal tool
 * here.
 */
export function registerProvenanceTools(server: McpServer, callApi: CallApi): void {
  server.registerTool(
    'lexq_provenance_get',
    {
      title: 'Get Decision Provenance',
      annotations: READ_ONLY,
      description: `Get the lineage of a single decision: what was decided, deterministic why per rule, input facts (PII facts are masked as •••••• with maskedKeys listing them — values are revealable only in the console, audited), the authored/published/deployed responsibility chain, and the rule snapshot fingerprint. lineage.unavailableReason is null when all three layers (authored, published, deployed) are present. Otherwise it says why one or more layers are null: ${withNotes(UNAVAILABLE_REASON_NOTES).join('; ')}.`,
      inputSchema: z.object({
        traceId: z.string().describe('Trace ID of the execution'),
      }),
    },
    async ({ traceId }) => callApi('GET', `provenance/${traceId}`),
  );

  server.registerTool(
    'lexq_pii_reveals_list',
    {
      title: 'List PII Reveal Audits',
      annotations: READ_ONLY,
      description:
        'List the PII reveal audit ledger — who revealed which fact of which trace, and when. Metadata only; revealed values are never stored or returned. Use for monthly access-log inspection and SIEM collection.',
      inputSchema: z.object({
        page: z.number().int().min(0).default(0).describe('Page number'),
        size: z.number().int().min(1).max(100).default(20).describe('Page size'),
        traceId: z.string().optional().describe('Filter by trace ID (exact match)'),
        revealedBy: z.string().optional().describe('Filter by operator ID (exact match)'),
        factKey: z
          .string()
          .optional()
          .describe('Filter by fact key (partial match, case-insensitive)'),
        startDate: z.string().optional().describe(START_DAY),
        endDate: z.string().optional().describe(END_DAY),
      }),
    },
    async ({ page, size, traceId, revealedBy, factKey, startDate, endDate }) => {
      const params: Record<string, string> = paginationParams(page, size);
      if (traceId) params.traceId = traceId;
      if (revealedBy) params.revealedBy = revealedBy;
      if (factKey) params.factKey = factKey;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      return callApi('GET', 'provenance/reveal-audits', { params });
    },
  );
}
