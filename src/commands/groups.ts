import { Command } from 'commander';
import { apiRequest} from '@/lib/api-client';
import type {PageResponse} from "@/types/api";
import { printJson, printTable, printError, type OutputFormat } from '@/lib/output';
import type {PolicyGroupSummary} from "@/types/groups";

export function registerGroupCommands(program: Command): void {
    const groups = program.command('groups').description('Manage policy groups');

    // ── list ──
    groups
        .command('list')
        .description('List all policy groups')
        .option('--page <number>', 'Page number', '0')
        .option('--size <number>', 'Page size', '20')
        .action(async (opts) => {
            try {
                const globalOpts = program.opts();
                const format: OutputFormat = globalOpts.format ?? 'json';

                const data = await apiRequest<PageResponse<PolicyGroupSummary>>(
                    'GET',
                    'policy-groups',
                    {
                        apiKey: globalOpts.apiKey,
                        baseUrl: globalOpts.baseUrl,
                        dryRun: globalOpts.dryRun,
                        verbose: globalOpts.verbose,
                        params: { page: opts.page, size: opts.size },
                    }
                );

                if (format === 'table') {
                    printTable(
                        ['ID', 'Name', 'Status', 'Priority', 'Live', 'Updated'],
                        data.content.map((g) => [
                            g.id,
                            g.name,
                            g.status,
                            String(g.priority),
                            g.liveVersionNo != null ? `v${g.liveVersionNo}` : '–',
                            g.updatedAt.substring(0, 10),
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
    groups
        .command('get')
        .description('Get a policy group by ID')
        .requiredOption('--id <groupId>', 'Policy group ID')
        .action(async (opts) => {
            try {
                const globalOpts = program.opts();
                const data = await apiRequest<PolicyGroupSummary>(
                    'GET',
                    `policy-groups/${opts.id}`,
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

    // ── create ──
    groups
        .command('create')
        .description('Create a new policy group')
        .requiredOption('--json <body>', 'Request body as JSON string')
        .action(async (opts) => {
            try {
                const globalOpts = program.opts();
                const body = JSON.parse(opts.json);
                const data = await apiRequest<PolicyGroupSummary>(
                    'POST',
                    'policy-groups',
                    {
                        apiKey: globalOpts.apiKey,
                        baseUrl: globalOpts.baseUrl,
                        dryRun: globalOpts.dryRun,
                        verbose: globalOpts.verbose,
                        body,
                    }
                );
                printJson(data);
            } catch (error) {
                printError(error);
                process.exit(1);
            }
        });

    // ── delete ──
    groups
        .command('delete')
        .description('Delete a policy group')
        .requiredOption('--id <groupId>', 'Policy group ID')
        .option('--force', 'Skip confirmation prompt')
        .action(async (opts) => {
            try {
                const globalOpts = program.opts();

                if (!opts.force) {
                    const { createInterface } = await import('node:readline/promises');
                    const rl = createInterface({ input: process.stdin, output: process.stdout });
                    const answer = await rl.question(`Delete group ${opts.id}? [y/N] `);
                    rl.close();
                    if (answer.toLowerCase() !== 'y') {
                        console.log('Cancelled.');
                        return;
                    }
                }

                await apiRequest<void>('DELETE', `policy-groups/${opts.id}`, {
                    apiKey: globalOpts.apiKey,
                    baseUrl: globalOpts.baseUrl,
                    dryRun: globalOpts.dryRun,
                    verbose: globalOpts.verbose,
                });
                console.log(`✓ Group ${opts.id} deleted.`);
            } catch (error) {
                printError(error);
                process.exit(1);
            }
        });
}