import { Command } from 'commander';
import { apiRequest } from '@/lib/api-client';
import type { PageResponse } from '@/types/api';
import { printJson, printTable, printError, type OutputFormat } from '@/lib/output';
import type { FailureLogResponse, BulkActionResponse } from '@/types/logs';

export function registerLogCommands(program: Command): void {
    const logs = program.command('logs').description('Failure logs');

    // ── list ──
    logs
        .command('list')
        .description('List failure logs')
        .option('--category <category>', 'Filter by category (INTEGRATION, INTERNAL)')
        .option('--task-type <taskType>', 'Filter by task type (COUPON_ISSUE, POINT_EARN, NOTIFICATION_SEND, WEBHOOK_EXECUTE)')
        .option('--status <status>', 'Filter by status (PENDING, RESOLVED, IGNORED)')
        .option('--keyword <keyword>', 'Search keyword')
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
                if (opts.category) params.category = opts.category;
                if (opts.taskType) params.taskType = opts.taskType;
                if (opts.status) params.status = opts.status;
                if (opts.keyword) params.searchKeyword = opts.keyword;
                if (opts.startDate) params.startDate = opts.startDate;
                if (opts.endDate) params.endDate = opts.endDate;

                const data = await apiRequest<PageResponse<FailureLogResponse>>(
                    'GET',
                    'failure-logs',
                    {
                        apiKey: globalOpts.apiKey,
                        baseUrl: globalOpts.baseUrl,
                        dryRun: globalOpts.dryRun,
                        verbose: globalOpts.verbose,
                        params,
                    }
                );

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
                        { truncate: 24 }
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
        .action(async (opts) => {
            try {
                const globalOpts = program.opts();
                const data = await apiRequest<FailureLogResponse>(
                    'GET',
                    `failure-logs/${opts.id}`,
                    {
                        apiKey: globalOpts.apiKey,
                        baseUrl: globalOpts.baseUrl,
                        dryRun: globalOpts.dryRun,
                        verbose: globalOpts.verbose,
                    }
                );
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
                    }
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
        .action(async (opts) => {
            try {
                const globalOpts = program.opts();
                const logIds = (opts.ids as string).split(',').map((id: string) => id.trim());

                const data = await apiRequest<BulkActionResponse>(
                    'POST',
                    'failure-logs/bulk-actions',
                    {
                        apiKey: globalOpts.apiKey,
                        baseUrl: globalOpts.baseUrl,
                        dryRun: globalOpts.dryRun,
                        verbose: globalOpts.verbose,
                        body: { logIds, action: opts.action },
                    }
                );
                printJson(data);
            } catch (error) {
                printError(error);
                process.exit(1);
            }
        });
}