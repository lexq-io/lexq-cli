import { readFileSync } from 'node:fs';
import { type Command } from 'commander';
import { apiRequest } from '@/lib/api-client';
import type { PageResponse } from '@/types/api';
import { printJson, printTable, printError, type OutputFormat } from '@/lib/output';
import type {
    DryRunResponse,
    RequirementsResponse,
    SimulationHistoryResponse,
    SimulationResponse,
} from '@/types/analytics';

export function registerAnalyticsCommands(program: Command): void {
    const analytics = program.command('analytics').description('Dry run, simulation, and requirements');

    // ══════════════════════════════════════════════════
    // Dry Run
    // ══════════════════════════════════════════════════

    analytics
        .command('dry-run')
        .description('Execute a single dry run against a version')
        .requiredOption('--version-id <versionId>', 'Policy version ID')
        .option('--json <body>', 'Request body as JSON string')
        .option('--file <path>', 'Read request body from a JSON file')
        .option('--debug', 'Include debug traces', false)
        .option('--mock', 'Mock external calls', false)
        .action(async (opts) => {
            try {
                const globalOpts = program.opts();
                const body = resolveBody(opts);

                if (!body.facts) {
                    throw new Error('Request body must include "facts". Use --json or --file.');
                }

                body.includeDebugInfo = opts.debug;
                body.mockExternalCalls = opts.mock;

                const data = await apiRequest<DryRunResponse>(
                    'POST',
                    `analytics/dry-run/versions/${opts.versionId}`,
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

    // ══════════════════════════════════════════════════
    // Dry Run Compare
    // ══════════════════════════════════════════════════

    analytics
        .command('dry-run-compare')
        .description('Compare dry run results between two versions')
        .option('--json <body>', 'Request body as JSON string')
        .option('--file <path>', 'Read request body from a JSON file')
        .action(async (opts) => {
            try {
                const globalOpts = program.opts();
                const body = resolveBody(opts);

                if (!body.facts || !body.versionIdA || !body.versionIdB) {
                    throw new Error('Request body must include "facts", "versionIdA", "versionIdB". Use --json or --file.');
                }

                const data = await apiRequest<unknown>(
                    'POST',
                    'analytics/dry-run/compare',
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

    // ══════════════════════════════════════════════════
    // Requirements
    // ══════════════════════════════════════════════════

    analytics
        .command('requirements')
        .description('Analyze required input facts for a version')
        .requiredOption('--group-id <groupId>', 'Policy group ID')
        .requiredOption('--version-id <versionId>', 'Policy version ID')
        .action(async (opts) => {
            try {
                const globalOpts = program.opts();
                const format: OutputFormat = globalOpts.format ?? 'json';

                const data = await apiRequest<RequirementsResponse>(
                    'GET',
                    `analytics/groups/${opts.groupId}/versions/${opts.versionId}/requirements`,
                    {
                        apiKey: globalOpts.apiKey,
                        baseUrl: globalOpts.baseUrl,
                        dryRun: globalOpts.dryRun,
                        verbose: globalOpts.verbose,
                    }
                );

                if (format === 'table') {
                    printTable(
                        ['Key', 'Type', 'Name', 'Required', 'Used By'],
                        data.requiredFacts.map((f) => [
                            f.key,
                            f.type ?? '–',
                            f.displayName ?? '–',
                            f.required ? '✓' : '–',
                            f.usedBy.join(', ') || '–',
                        ])
                    );
                    console.log('\nExample request:');
                    console.log(JSON.stringify(data.exampleRequest, null, 2));
                } else {
                    printJson(data);
                }
            } catch (error) {
                printError(error);
                process.exit(1);
            }
        });

    // ══════════════════════════════════════════════════
    // Simulation
    // ══════════════════════════════════════════════════

    const sim = analytics.command('simulation').description('Manage batch simulations');

    // ── start ──
    sim
        .command('start')
        .description('Start a new batch simulation')
        .requiredOption('--json <body>', 'Simulation request body as JSON')
        .option('--file <path>', 'Read request body from a JSON file')
        .action(async (opts) => {
            try {
                const globalOpts = program.opts();
                const body = resolveBody(opts);

                const data = await apiRequest<SimulationResponse>(
                    'POST',
                    'analytics/simulations',
                    {
                        apiKey: globalOpts.apiKey,
                        baseUrl: globalOpts.baseUrl,
                        dryRun: globalOpts.dryRun,
                        verbose: globalOpts.verbose,
                        body,
                    }
                );
                console.log(`✓ Simulation started: ${data.simulationId} (${data.status})`);
                printJson(data);
            } catch (error) {
                printError(error);
                process.exit(1);
            }
        });

    // ── status ──
    sim
        .command('status')
        .description('Get simulation status and results')
        .requiredOption('--id <simulationId>', 'Simulation ID')
        .action(async (opts) => {
            try {
                const globalOpts = program.opts();
                const data = await apiRequest<SimulationResponse>(
                    'GET',
                    `analytics/simulations/${opts.id}`,
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

    // ── list ──
    sim
        .command('list')
        .description('List simulation history')
        .option('--status <status>', 'Filter by status (PENDING, RUNNING, COMPLETED, FAILED, CANCELLED)')
        .option('--from <date>', 'Start date (yyyy-MM-dd)')
        .option('--to <date>', 'End date (yyyy-MM-dd)')
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
                if (opts.status) params.status = opts.status;
                if (opts.from) params.from = opts.from;
                if (opts.to) params.to = opts.to;

                const data = await apiRequest<PageResponse<SimulationHistoryResponse>>(
                    'GET',
                    'analytics/simulations',
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
                        ['ID', 'Group', 'Target', 'Status', 'Match', 'Records', 'Created'],
                        data.content.map((s) => [
                            s.simulationId.substring(0, 8),
                            s.policyGroupName,
                            s.targetVersionName ?? '–',
                            s.status,
                            `${(s.matchRate * 100).toFixed(1)}%`,
                            String(s.totalRecords),
                            s.createdAt.substring(0, 16),
                        ]),
                        { truncate: 20 }
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

    // ── cancel ──
    sim
        .command('cancel')
        .description('Cancel a running simulation')
        .requiredOption('--id <simulationId>', 'Simulation ID')
        .option('--force', 'Skip confirmation prompt')
        .action(async (opts) => {
            try {
                const globalOpts = program.opts();

                if (!opts.force) {
                    const { createInterface } = await import('node:readline/promises');
                    const rl = createInterface({ input: process.stdin, output: process.stdout });
                    const answer = await rl.question(`Cancel simulation ${opts.id}? [y/N] `);
                    rl.close();
                    if (answer.toLowerCase() !== 'y') {
                        console.log('Cancelled.');
                        return;
                    }
                }

                await apiRequest<void>(
                    'DELETE',
                    `analytics/simulations/${opts.id}`,
                    {
                        apiKey: globalOpts.apiKey,
                        baseUrl: globalOpts.baseUrl,
                        dryRun: globalOpts.dryRun,
                        verbose: globalOpts.verbose,
                    }
                );
                console.log(`✓ Simulation ${opts.id} cancelled.`);
            } catch (error) {
                printError(error);
                process.exit(1);
            }
        });

    // ── export ──
    sim
        .command('export')
        .description('Export simulation results')
        .requiredOption('--id <simulationId>', 'Simulation ID')
        .option('--format <fmt>', 'Export format: csv or json', 'json')
        .option('--output <path>', 'Output file path')
        .action(async (opts) => {
            try {
                const globalOpts = program.opts();
                const exportFormat = opts.format === 'csv' ? 'csv' : 'json';

                const response = await apiRequest<unknown>(
                    'GET',
                    `analytics/simulations/${opts.id}/export`,
                    {
                        apiKey: globalOpts.apiKey,
                        baseUrl: globalOpts.baseUrl,
                        dryRun: globalOpts.dryRun,
                        verbose: globalOpts.verbose,
                        params: { format: exportFormat },
                    }
                );

                if (opts.output) {
                    const { writeFileSync } = await import('node:fs');
                    const text = typeof response === 'string'
                        ? response
                        : JSON.stringify(response, null, 2);
                    writeFileSync(opts.output, text, 'utf-8');
                    console.log(`✓ Exported to ${opts.output}`);
                } else {
                    printJson(response);
                }
            } catch (error) {
                printError(error);
                process.exit(1);
            }
        });
}

// ── Helpers ──

function resolveBody(opts: Record<string, string | boolean | undefined>): Record<string, unknown> {
    if (opts.file) {
        const raw = readFileSync(opts.file as string, 'utf-8');
        return JSON.parse(raw);
    }
    if (opts.json) {
        return JSON.parse(opts.json as string);
    }
    return {};
}