import { Command } from 'commander';
import { apiRequest } from '@/lib/api-client';
import type { PageResponse } from '@/types/api';
import { printJson, printTable, printError, type OutputFormat } from '@/lib/output';
import type {
    PolicyGroupSummary,
    PolicyGroupDetail,
    CreatePolicyGroupRequest,
    UpdatePolicyGroupRequest,
    StartAbTestRequest,
    AdjustTrafficRateRequest,
} from '@/types/groups';

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
                        ['ID', 'Name', 'Status', 'Priority', 'Version', 'Updated'],
                        data.content.map((g) => [
                            g.id,
                            g.name,
                            g.status,
                            String(g.priority),
                            g.currentVersionName ?? '–',
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
                const data = await apiRequest<PolicyGroupDetail>(
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
                const body = JSON.parse(opts.json) as CreatePolicyGroupRequest;
                const data = await apiRequest<PolicyGroupDetail>(
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

    // ── update ──
    groups
        .command('update')
        .description('Update a policy group')
        .requiredOption('--id <groupId>', 'Policy group ID')
        .requiredOption('--json <body>', 'Request body as JSON string')
        .action(async (opts) => {
            try {
                const globalOpts = program.opts();
                const body = JSON.parse(opts.json) as UpdatePolicyGroupRequest;
                const data = await apiRequest<PolicyGroupDetail>(
                    'PUT',
                    `policy-groups/${opts.id}`,
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

                await apiRequest<void>(
                    'DELETE',
                    `policy-groups/${opts.id}`,
                    {
                        apiKey: globalOpts.apiKey,
                        baseUrl: globalOpts.baseUrl,
                        dryRun: globalOpts.dryRun,
                        verbose: globalOpts.verbose,
                    }
                );
                console.log(`✓ Group ${opts.id} deleted.`);
            } catch (error) {
                printError(error);
                process.exit(1);
            }
        });

    // ══════════════════════════════════════════════════
    // A/B Test
    // ══════════════════════════════════════════════════

    const abTest = groups.command('ab-test').description('A/B test management');

    // ── start ──
    abTest
        .command('start')
        .description('Start an A/B test')
        .requiredOption('--group-id <groupId>', 'Policy group ID')
        .requiredOption('--version-id <versionId>', 'Challenger version ID')
        .requiredOption('--traffic-rate <rate>', 'Traffic rate for challenger (1-99)')
        .action(async (opts) => {
            try {
                const globalOpts = program.opts();
                const body: StartAbTestRequest = {
                    testVersionId: opts.versionId,
                    trafficRate: Number(opts.trafficRate),
                };
                const data = await apiRequest<PolicyGroupDetail>(
                    'POST',
                    `policy-groups/${opts.groupId}/ab-test`,
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

    // ── stop ──
    abTest
        .command('stop')
        .description('Stop an A/B test')
        .requiredOption('--group-id <groupId>', 'Policy group ID')
        .option('--force', 'Skip confirmation prompt')
        .action(async (opts) => {
            try {
                const globalOpts = program.opts();

                if (!opts.force) {
                    const { createInterface } = await import('node:readline/promises');
                    const rl = createInterface({ input: process.stdin, output: process.stdout });
                    const answer = await rl.question(`Stop A/B test for group ${opts.groupId}? [y/N] `);
                    rl.close();
                    if (answer.toLowerCase() !== 'y') {
                        console.log('Cancelled.');
                        return;
                    }
                }

                const data = await apiRequest<unknown>(
                    'DELETE',
                    `policy-groups/${opts.groupId}/ab-test`,
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

    // ── adjust ──
    abTest
        .command('adjust')
        .description('Adjust A/B test traffic rate')
        .requiredOption('--group-id <groupId>', 'Policy group ID')
        .requiredOption('--traffic-rate <rate>', 'New traffic rate (1-99)')
        .action(async (opts) => {
            try {
                const globalOpts = program.opts();
                const body: AdjustTrafficRateRequest = {
                    trafficRate: Number(opts.trafficRate),
                };
                const data = await apiRequest<unknown>(
                    'PATCH',
                    `policy-groups/${opts.groupId}/ab-test/traffic-rate`,
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
}