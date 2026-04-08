import { type Command } from 'commander';
import { apiRequest } from '@/lib/api-client';
import type { PageResponse } from '@/types/api';
import { printJson, printTable, printError, type OutputFormat } from '@/lib/output';
import type {
  ExecutionHistorySummary,
  ExecutionHistoryDetail,
  ExecutionStatsResponse,
} from '@/types/history';

export function registerHistoryCommands(program: Command): void {
  const history = program.command('history').description('Execution history');

  // ── list ──
  history
    .command('list')
    .description('List execution history')
    .option('--trace-id <traceId>', 'Filter by trace ID')
    .option('--group-id <groupId>', 'Filter by policy group')
    .option('--version-id <versionId>', 'Filter by version')
    .option('--status <status>', 'Filter by status (SUCCESS, NO_MATCH, ERROR, TIMEOUT)')
    .option('--start-date <date>', 'Start date (yyyy-MM-dd)')
    .option('--end-date <date>', 'End date (yyyy-MM-dd)')
    .option('--page <number>', 'Page number', '0')
    .option('--size <number>', 'Page size', '20')
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const format: OutputFormat = globalOpts.format ?? 'json';

        const params: Record<string, string> = {
          page: opts.page,
          size: opts.size,
        };
        if (opts.traceId) params.traceId = opts.traceId;
        if (opts.groupId) params.policyGroupId = opts.groupId;
        if (opts.versionId) params.versionId = opts.versionId;
        if (opts.status) params.status = opts.status;
        if (opts.startDate) params.startDate = opts.startDate;
        if (opts.endDate) params.endDate = opts.endDate;

        const data = await apiRequest<PageResponse<ExecutionHistorySummary>>(
          'GET',
          'execution/history',
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
            ['Trace', 'Group', 'Version', 'Status', 'Matched', 'Latency', 'At'],
            data.content.map((h) => [
              h.traceId.substring(0, 12),
              h.policyGroupName ?? '–',
              h.policyVersionNo != null ? `v${h.policyVersionNo}` : '–',
              h.status,
              h.isMatched ? '✓' : '✗',
              `${h.latencyMs}ms`,
              h.createdAt.substring(0, 16),
            ]),
            { truncate: 20 },
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

  // ── get ──
  history
    .command('get')
    .description('Get execution detail')
    .requiredOption('--id <executionId>', 'Execution history ID')
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const data = await apiRequest<ExecutionHistoryDetail>(
          'GET',
          `execution/history/${opts.id}`,
          {
            apiKey: globalOpts.apiKey,
            baseUrl: globalOpts.baseUrl,
            dryRun: globalOpts.dryRun,
            verbose: globalOpts.verbose,
          },
        );
        printJson(data);
      } catch (error) {
        printError(error);
        process.exit(1);
      }
    });

  // ── stats ──
  history
    .command('stats')
    .description('Get execution statistics')
    .option('--group-id <groupId>', 'Filter by policy group')
    .option('--start-date <date>', 'Start date (yyyy-MM-dd)')
    .option('--end-date <date>', 'End date (yyyy-MM-dd)')
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const format: OutputFormat = globalOpts.format ?? 'json';

        const params: Record<string, string> = {};
        if (opts.groupId) params.policyGroupId = opts.groupId;
        if (opts.startDate) params.startDate = opts.startDate;
        if (opts.endDate) params.endDate = opts.endDate;

        const data = await apiRequest<ExecutionStatsResponse>('GET', 'execution/history/stats', {
          apiKey: globalOpts.apiKey,
          baseUrl: globalOpts.baseUrl,
          dryRun: globalOpts.dryRun,
          verbose: globalOpts.verbose,
          params,
        });

        if (format === 'table') {
          printTable(
            ['Total', 'Success', 'No Match', 'Failures', 'Success Rate', 'Avg Latency'],
            [
              [
                String(data.totalExecutions),
                String(data.successCount),
                String(data.noMatchCount),
                String(data.failureCount),
                `${data.successRate}%`,
                `${data.avgLatencyMs}ms`,
              ],
            ],
          );
        } else {
          printJson(data);
        }
      } catch (error) {
        printError(error);
        process.exit(1);
      }
    });
}
