import { type Command } from 'commander';
import dedent from 'dedent';
import { apiRequest } from '@/lib/api-client';
import type { PageResponse } from '@/types/api';
import { printJson, printTable, printError, type OutputFormat } from '@/lib/output';
import type { FailureLogResponse } from '@/types/logs';
import { FailureStatus, TaskType } from '@/types/enums';
import { END_DAY, START_DAY, utcMinute } from '@/lib/dates';
import { FAILURE_LOG_LOOKBACK_DAYS } from '@/types/constants';
import { withNotes } from '@/lib/enum-notes';
import { FAILURE_LOG_CONSOLE_NOTE } from '@/lib/console';

const STATUS_NOTES = {
  PENDING: 'needs attention',
  RESOLVED: '',
  IGNORED: '',
} satisfies Record<FailureStatus, string>;

export function registerLogCommands(program: Command): void {
  const logs = program
    .command('logs')
    .description('Failure logs')
    .addHelpText(
      'after',
      dedent`

        Failure logs for platform event webhooks and scheduled deployments that failed.

        Commands:
          list         List failure logs with filters
          get          Get failure log detail (includes the original payload)

        ${FAILURE_LOG_CONSOLE_NOTE}

        Statuses: ${withNotes(STATUS_NOTES).join(', ')}
      `,
    );

  // ── list ──
  logs
    .command('list')
    .description('List failure logs')
    .option('--task-type <taskType>', `Filter by task type (${TaskType.join(', ')})`)
    .option('--status <status>', `Filter by status (${FailureStatus.join(', ')})`)
    .option('--keyword <keyword>', 'Search keyword')
    .option('--start-date <date>', START_DAY)
    .option('--end-date <date>', END_DAY)
    .option('--page <number>', 'Page number', '0')
    .option('--size <number>', 'Page size', '20')
    .addHelpText(
      'after',
      dedent`

        Without dates the window is ${FAILURE_LOG_LOOKBACK_DAYS} days back through today, in the organization
        time zone. Pass --start-date to look further back.

        Examples:
          $ lexq logs list --status PENDING --format table
          $ lexq logs list --task-type PLATFORM_WEBHOOK
          $ lexq logs list --keyword "timeout" --start-date 2026-04-01
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const format: OutputFormat = globalOpts.format ?? 'json';

        const params: Record<string, string> = { page: opts.page, size: opts.size };
        if (opts.taskType) params.taskType = opts.taskType;
        if (opts.status) params.status = opts.status;
        if (opts.keyword) params.searchKeyword = opts.keyword;
        if (opts.startDate) params.startDate = opts.startDate;
        if (opts.endDate) params.endDate = opts.endDate;

        const data = await apiRequest<PageResponse<FailureLogResponse>>('GET', 'failure-logs', {
          apiKey: globalOpts.apiKey,
          baseUrl: globalOpts.baseUrl,
          dryRun: globalOpts.dryRun,
          verbose: globalOpts.verbose,
          params,
        });

        if (format === 'table') {
          printTable(
            ['ID', 'Task', 'Status', 'Error', 'Created'],
            data.content.map((l) => [
              l.id.substring(0, 8),
              l.taskType,
              l.status,
              l.errorMessage?.substring(0, 24) ?? '–',
              utcMinute(l.createdAt),
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

  // ── get ──
  logs
    .command('get')
    .description('Get failure log detail')
    .requiredOption('--id <logId>', 'Log ID')
    .addHelpText(
      'after',
      dedent`

        Includes the full payload that was used for the failed operation.
        Use this to inspect what went wrong. Resolving or ignoring a log happens in the
        console; see lexq logs --help.
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const data = await apiRequest<FailureLogResponse>('GET', `failure-logs/${opts.id}`, {
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
}
