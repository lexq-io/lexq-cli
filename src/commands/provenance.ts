import { type Command } from 'commander';
import dedent from 'dedent';
import { apiRequest } from '@/lib/api-client';
import type { PageResponse } from '@/types/api';
import { printJson, printTable, printError, type OutputFormat } from '@/lib/output';
import type { RevealAuditItem } from '@/types/provenance';

/**
 * PII reveal itself is console-only by contract (CONVENTIONS §12.6) —
 * no reveal subcommand here. See src/mcp/tools/provenance.ts header.
 */
export function registerProvenanceCommands(program: Command): void {
  const provenance = program
    .command('provenance')
    .description('Decision Provenance')
    .addHelpText(
      'after',
      dedent`

        Trace who authored, published, and deployed the rules behind a decision.

        Commands:
          get            Get the lineage of one decision (PII facts masked)
          reveal-audits  List the PII reveal audit ledger (metadata only)
      `,
    );

  // ── get ──
  provenance
    .command('get')
    .description('Get decision lineage')
    .requiredOption('--trace-id <traceId>', 'Trace ID of the execution')
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const data = await apiRequest('GET', `provenance/${opts.traceId}`, {
          apiKey: globalOpts.apiKey,
          baseUrl: globalOpts.baseUrl,
          dryRun: globalOpts.dryRun,
          verbose: globalOpts.verbose,
        });
        printJson(data);
      } catch (error) {
        printError(error);
        process.exit(1);
      }
    });

  // ── reveal-audits ──
  provenance
    .command('reveal-audits')
    .description('List PII reveal audits (who revealed what, when)')
    .option('--trace-id <traceId>', 'Filter by trace ID (exact)')
    .option('--fact-key <factKey>', 'Filter by fact key (partial, case-insensitive)')
    .option('--revealed-by <operatorId>', 'Filter by operator ID (exact)')
    .option('--start-date <date>', 'Start date (yyyy-MM-dd)')
    .option('--end-date <date>', 'End date (yyyy-MM-dd)')
    .option('--page <number>', 'Page number', '0')
    .option('--size <number>', 'Page size', '20')
    .addHelpText(
      'after',
      dedent`

        Metadata only — revealed values are never stored or returned.

        Example:
          $ lexq provenance reveal-audits --start-date 2026-07-01 --format table
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const format: OutputFormat = globalOpts.format ?? 'json';

        const params: Record<string, string> = { page: opts.page, size: opts.size };
        if (opts.traceId) params.traceId = opts.traceId;
        if (opts.factKey) params.factKey = opts.factKey;
        if (opts.revealedBy) params.revealedBy = opts.revealedBy;
        if (opts.startDate) params.startDate = opts.startDate;
        if (opts.endDate) params.endDate = opts.endDate;

        const data = await apiRequest<PageResponse<RevealAuditItem>>(
          'GET',
          'provenance/reveal-audits',
          {
            apiKey: globalOpts.apiKey,
            baseUrl: globalOpts.baseUrl,
            dryRun: globalOpts.dryRun,
            verbose: globalOpts.verbose,
            params,
          },
        );

        if (format === 'table') {
          printTable(
            ['Revealed At', 'By', 'Fact Key', 'Trace'],
            data.content.map((a) => [
              a.revealedAt.substring(0, 16),
              a.revealedByName,
              a.factKey,
              a.traceId.substring(0, 12),
            ]),
            { truncate: 24 },
          );
          console.log(`\n${data.totalElements} total · page ${data.pageNo + 1}/${data.totalPages}`);
        } else {
          printJson(data);
        }
      } catch (error) {
        printError(error);
        process.exit(1);
      }
    });
}
