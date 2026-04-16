import { type Command } from 'commander';
import dedent from 'dedent';
import { apiRequest } from '@/lib/api-client';
import type { PageResponse } from '@/types/api';
import { printJson, printTable, printError, type OutputFormat } from '@/lib/output';
import type { FailureLogResponse, BulkActionResponse } from '@/types/logs';
import { TaskType } from '@/types/enums';

export function registerLogCommands(program: Command): void {
  const logs = program
    .command('logs')
    .description('Failure logs')
    .addHelpText(
      'after',
      dedent`

        System failure logs (DLQ) for background tasks — webhook calls, coupon issuance,
        point operations, notifications, and platform event webhooks.

        Commands:
          list         List failure logs with filters
          get          Get failure log detail (includes payload for retry)
          action       Process a single log (RETRY, IGNORE, RESOLVE)
          bulk-action  Process multiple logs at once

        Statuses: PENDING (needs attention), RESOLVED, IGNORED
        Categories: INTEGRATION (external), INTERNAL (system)
      `,
    );

  // ── list ──
  logs
    .command('list')
    .description('List failure logs')
    .option('--category <category>', 'Filter by category (INTEGRATION, INTERNAL)')
    .option('--task-type <taskType>', `Filter by task type (${TaskType.join(', ')})`)
    .option('--status <status>', 'Filter by status (PENDING, RESOLVED, IGNORED)')
    .option('--keyword <keyword>', 'Search keyword')
    .option('--start-date <date>', 'Start date (yyyy-MM-dd)')
    .option('--end-date <date>', 'End date (yyyy-MM-dd)')
    .option('--page <number>', 'Page number', '0')
    .option('--size <number>', 'Page size', '20')
    .addHelpText(
      'after',
      dedent`

        Examples:
          $ lexq logs list --status PENDING --format table
          $ lexq logs list --task-type PLATFORM_WEBHOOK --category INTERNAL
          $ lexq logs list --keyword "timeout" --start-date 2026-04-01
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const format: OutputFormat = globalOpts.format ?? 'json';

        const params: Record<string, string> = { page: opts.page, size: opts.size };
        if (opts.category) params.category = opts.category;
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
            ['ID', 'Category', 'Task', 'Status', 'Retries', 'Error', 'Created'],
            data.content.map((l) => [
              l.id.substring(0, 8),
              l.category,
              l.taskType,
              l.status,
              String(l.retryCount),
              l.errorMessage?.substring(0, 24) ?? '–',
              l.createdAt.substring(0, 16),
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
        Use this to inspect what went wrong before deciding to RETRY or RESOLVE.
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

  // ── action ──
  logs
    .command('action')
    .description('Process a failure log action (RETRY, IGNORE, RESOLVE)')
    .requiredOption('--id <logId>', 'Log ID')
    .requiredOption('--action <action>', 'Action: RETRY, IGNORE, or RESOLVE')
    .addHelpText(
      'after',
      dedent`

        Actions:
          RETRY    Re-execute the failed operation with the original payload
          IGNORE   Mark as intentionally skipped (won't appear in PENDING)
          RESOLVE  Mark as manually resolved (e.g., fixed via external system)

        Example:
          $ lexq logs action --id <logId> --action RETRY
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const data = await apiRequest<FailureLogResponse>(
          'POST',
          `failure-logs/${opts.id}/actions`,
          {
            apiKey: globalOpts.apiKey,
            baseUrl: globalOpts.baseUrl,
            dryRun: globalOpts.dryRun,
            verbose: globalOpts.verbose,
            params: { action: opts.action },
          },
        );
        printJson(data);
      } catch (error) {
        printError(error);
        process.exit(1);
      }
    });

  // ── bulk-action ──
  logs
    .command('bulk-action')
    .description('Bulk process failure logs')
    .requiredOption('--ids <logIds>', 'Comma-separated log IDs')
    .requiredOption('--action <action>', 'Action: RETRY, IGNORE, or RESOLVE')
    .addHelpText(
      'after',
      dedent`

        Processes each log individually. Failures are skipped with a warning.

        Example:
          $ lexq logs bulk-action --ids "id1,id2,id3" --action RESOLVE
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const logIds = (opts.ids as string).split(',').map((id: string) => id.trim());

        const data = await apiRequest<BulkActionResponse>('POST', 'failure-logs/bulk-actions', {
          apiKey: globalOpts.apiKey,
          baseUrl: globalOpts.baseUrl,
          dryRun: globalOpts.dryRun,
          verbose: globalOpts.verbose,
          body: { logIds, action: opts.action },
        });
        printJson(data);
      } catch (error) {
        printError(error);
        process.exit(1);
      }
    });
}
