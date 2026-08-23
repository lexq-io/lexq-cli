import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CallApi } from './_shared';
import { paginationParams } from './_shared';

/**
 * Decision Provenance tools — read-only lineage + reveal audit ledger.
 *
 * Deliberately NOT exposed: the PII reveal endpoint (POST provenance/{traceId}/reveal).
 * Revealing routes PII plaintext into the calling agent's context (a third-party
 * surface), which violates the write-then-reveal contract's purpose of avoiding
 * plaintext replication. Reveal is console-only, by design.
 * Do not add a reveal tool here.
 */
export function registerProvenanceTools(server: McpServer, callApi: CallApi): void {
  server.registerTool(
    'lexq_provenance_get',
    {
      title: 'Get Decision Provenance',
      description:
        'Get the lineage of a single decision: what was decided, deterministic why per rule, input facts (PII facts are masked as •••••• with maskedKeys listing them — values are revealable only in the console, audited), the authored/published/deployed responsibility chain, and the rule snapshot fingerprint.',
      inputSchema: {
        traceId: z.string().describe('Trace ID of the execution'),
      },
    },
    async ({ traceId }) => callApi('GET', `provenance/${traceId}`),
  );

  server.registerTool(
    'lexq_pii_reveals_list',
    {
      title: 'List PII Reveal Audits',
      description:
        'List the PII reveal audit ledger — who revealed which fact of which trace, and when. Metadata only; revealed values are never stored or returned. Use for monthly access-log inspection and SIEM collection.',
      inputSchema: {
        page: z.number().int().min(0).default(0).describe('Page number'),
        size: z.number().int().min(1).max(100).default(20).describe('Page size'),
        traceId: z.string().optional().describe('Filter by trace ID (exact match)'),
        revealedBy: z.string().optional().describe('Filter by operator ID (exact match)'),
        factKey: z
          .string()
          .optional()
          .describe('Filter by fact key (partial match, case-insensitive)'),
        startDate: z.string().optional().describe('Start date (yyyy-MM-dd)'),
        endDate: z.string().optional().describe('End date (yyyy-MM-dd)'),
      },
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
