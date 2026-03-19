import { Command } from 'commander';
import { apiRequest } from '@/lib/api-client';
import type { PageResponse } from '@/types/api';
import { printJson, printTable, printError, type OutputFormat } from '@/lib/output';
import type { IntegrationResponse, IntegrationConfigSpecs } from '@/types/integrations';

export function registerIntegrationCommands(program: Command): void {
    const integrations = program.command('integrations').description('Manage external integrations');

    // ── list ──
    integrations
        .command('list')
        .description('List integrations')
        .option('--type <type>', 'Filter by type (COUPON, POINT, NOTIFICATION, CRM, MESSENGER, WEBHOOK)')
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
                if (opts.type) params.type = opts.type;

                const data = await apiRequest<PageResponse<IntegrationResponse>>(
                    'GET',
                    'integrations',
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
                        ['ID', 'Name', 'Type', 'URL', 'Active'],
                        data.content.map((i) => [
                            i.id.substring(0, 8),
                            i.name,
                            i.type,
                            i.baseUrl,
                            i.isActive ? '✓' : '✗',
                        ]),
                        { truncate: 28 }
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
    integrations
        .command('get')
        .description('Get integration detail')
        .requiredOption('--id <integrationId>', 'Integration ID')
        .action(async (opts) => {
            try {
                const globalOpts = program.opts();
                const data = await apiRequest<IntegrationResponse>(
                    'GET',
                    `integrations/${opts.id}`,
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

    // ── save ──
    integrations
        .command('save')
        .description('Create or update an integration')
        .requiredOption('--json <body>', 'Request body as JSON string')
        .action(async (opts) => {
            try {
                const globalOpts = program.opts();
                const body = JSON.parse(opts.json);
                const data = await apiRequest<IntegrationResponse>(
                    'POST',
                    'integrations',
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
    integrations
        .command('delete')
        .description('Delete an integration')
        .requiredOption('--id <integrationId>', 'Integration ID')
        .option('--force', 'Skip confirmation prompt')
        .action(async (opts) => {
            try {
                const globalOpts = program.opts();

                if (!opts.force) {
                    const { createInterface } = await import('node:readline/promises');
                    const rl = createInterface({ input: process.stdin, output: process.stdout });
                    const answer = await rl.question(`Delete integration ${opts.id}? [y/N] `);
                    rl.close();
                    if (answer.toLowerCase() !== 'y') {
                        console.log('Cancelled.');
                        return;
                    }
                }

                await apiRequest<void>(
                    'DELETE',
                    `integrations/${opts.id}`,
                    {
                        apiKey: globalOpts.apiKey,
                        baseUrl: globalOpts.baseUrl,
                        dryRun: globalOpts.dryRun,
                        verbose: globalOpts.verbose,
                    }
                );
                console.log(`✓ Integration ${opts.id} deleted.`);
            } catch (error) {
                printError(error);
                process.exit(1);
            }
        });

    // ── config-spec ──
    integrations
        .command('config-spec')
        .description('Get integration configuration field specs')
        .action(async () => {
            try {
                const globalOpts = program.opts();
                const data = await apiRequest<IntegrationConfigSpecs>(
                    'GET',
                    'integrations/config-spec',
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
}