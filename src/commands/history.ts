import { type Command } from 'commander';
import dedent from 'dedent';
import { apiRequest } from '@/lib/api-client';
import type { PageResponse } from '@/types/api';
import { printJson, printTable, printError, type OutputFormat } from '@/lib/output';
import type {
  ExecutionHistorySummary,
  ExecutionHistoryDetail,
  ExecutionStatsResponse,
} from '@/types/history';
import {
  END_DAY,
  START_DAY,
  STATS_DEFAULT_WINDOW_DAYS,
  STATS_MAX_WINDOW_DAYS,
  utcMinute,
} from '@/lib/dates';

export function registerHistoryCommands(program: Command): void {
  const history = program
    .command('history')
    .description('Execution history')
    .addHelpText(
      'after',
      dedent`

        View and analyze policy execution logs from production traffic.

        Commands:
          list    List execution history with filters
          get     Get full execution detail (request facts, traces, decisions)
          stats   Aggregate statistics (success rate, latency, counts)

        Statuses: SUCCESS, NO_MATCH, ERROR, TIMEOUT
      `,
    );

  // ── list ──
  history
    .command('list')
    .description('List execution history')
    .option('--trace-id <traceId>', 'Filter by trace ID')
    .option('--group-id <groupId>', 'Filter by policy group')
    .option('--version-id <versionId>', 'Filter by version')
    .option('--status <status>', 'Filter by status (SUCCESS, NO_MATCH, ERROR, TIMEOUT)')
    .option('--start-date <date>', START_DAY)
    .option('--end-date <date>', END_DAY)
    .option('--page <number>', 'Page number', '0')
    .option('--size <number>', 'Page size', '20')
    .addHelpText(
      'after',
      dedent`

        Examples:
          $ lexq history list --status ERROR --format table
          $ lexq history list --group-id <gid> --start-date 2026-04-01 --end-date 2026-04-15
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const format: OutputFormat = globalOpts.format ?? 'json';

        const params: Record<string, string> = { page: opts.page, size: opts.size };
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
              utcMinute(h.createdAt),
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
    .requiredOption('--id <traceId>', 'Trace ID')
    .addHelpText(
      'after',
      dedent`

        Returns the full execution detail including request facts, result traces,
        and decision traces (SELECTED, NO_MATCH, BLOCKED, etc.).
      `,
    )
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
    .option('--start-date <date>', START_DAY)
    .option('--end-date <date>', END_DAY)
    .addHelpText(
      'after',
      dedent`

        Shows total executions, success/no-match/failure counts, success rate, and avg latency.

        Without dates the window is the last ${STATS_DEFAULT_WINDOW_DAYS} days through today, in the organization
        time zone. At most ${STATS_MAX_WINDOW_DAYS} days per call; a longer range is rejected with AN-039.
        --start-date alone runs through today.

        Example:
          $ lexq history stats --format table
          $ lexq history stats --group-id <gid> --start-date 2026-04-01 --end-date 2026-04-30
      `,
    )
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
