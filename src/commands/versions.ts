import { type Command } from 'commander';
import { apiRequest } from '@/lib/api-client';
import type { PageResponse } from '@/types/api';
import { printJson, printTable, printError, type OutputFormat } from '@/lib/output';
import type { PolicyVersionSummary } from '@/types/versions';

export function registerVersionCommands(program: Command): void {
    const versions = program.command('versions').description('Manage policy versions');

    // ── list ──
    versions
        .command('list')
        .description('List versions for a policy group')
        .requiredOption('--group-id <groupId>', 'Policy group ID')
        .option('--page <number>', 'Page number', '0')
        .option('--size <number>', 'Page size', '20')
        .action(async (opts) => {
            try {
                const globalOpts = program.opts();
                const format: OutputFormat = globalOpts.format ?? 'json';

                const data = await apiRequest<PageResponse<PolicyVersionSummary>>(
                    'GET',
                    `policy-groups/${opts.groupId}/versions`,
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
                        ['ID', 'v#', 'Status', 'Commit', 'Hash', 'Created'],
                        data.content.map((v) => [
                            v.id,
                            `v${v.versionNo}`,
                            v.status,
                            v.commitMessage ?? '–',
                            v.snapshotHash ? v.snapshotHash.substring(0, 8) : '–',
                            v.createdAt.substring(0, 10),
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
    versions
        .command('get')
        .description('Get a policy version by ID')
        .requiredOption('--group-id <groupId>', 'Policy group ID')
        .requiredOption('--id <versionId>', 'Policy version ID')
        .action(async (opts) => {
            try {
                const globalOpts = program.opts();
                const data = await apiRequest<PolicyVersionSummary>(
                    'GET',
                    `policy-groups/${opts.groupId}/versions/${opts.id}`,
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
    versions
        .command('create')
        .description('Create a new draft version')
        .requiredOption('--group-id <groupId>', 'Policy group ID')
        .option('--commit-message <message>', 'Commit message')
        .option('--effective-from <date>', 'Effective from (ISO datetime)')
        .option('--effective-to <date>', 'Effective to (ISO datetime)')
        .option('--json <body>', 'Full request body as JSON (overrides other options)')
        .action(async (opts) => {
            try {
                const globalOpts = program.opts();
                const body = opts.json
                    ? JSON.parse(opts.json)
                    : buildCreateBody(opts);

                const data = await apiRequest<PolicyVersionSummary>(
                    'POST',
                    `policy-groups/${opts.groupId}/versions`,
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
    versions
        .command('update')
        .description('Update a draft version metadata')
        .requiredOption('--group-id <groupId>', 'Policy group ID')
        .requiredOption('--id <versionId>', 'Policy version ID')
        .option('--commit-message <message>', 'Commit message')
        .option('--effective-from <date>', 'Effective from (ISO datetime)')
        .option('--effective-to <date>', 'Effective to (ISO datetime)')
        .option('--json <body>', 'Full request body as JSON (overrides other options)')
        .action(async (opts) => {
            try {
                const globalOpts = program.opts();
                const body = opts.json
                    ? JSON.parse(opts.json)
                    : buildUpdateBody(opts);

                const data = await apiRequest<PolicyVersionSummary>(
                    'PUT',
                    `policy-groups/${opts.groupId}/versions/${opts.id}`,
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
    versions
        .command('delete')
        .description('Delete a policy version')
        .requiredOption('--group-id <groupId>', 'Policy group ID')
        .requiredOption('--id <versionId>', 'Policy version ID')
        .option('--force', 'Skip confirmation prompt')
        .action(async (opts) => {
            try {
                const globalOpts = program.opts();

                if (!opts.force) {
                    const { createInterface } = await import('node:readline/promises');
                    const rl = createInterface({ input: process.stdin, output: process.stdout });
                    const answer = await rl.question(`Delete version ${opts.id}? [y/N] `);
                    rl.close();
                    if (answer.toLowerCase() !== 'y') {
                        console.log('Cancelled.');
                        return;
                    }
                }

                await apiRequest<void>(
                    'DELETE',
                    `policy-groups/${opts.groupId}/versions/${opts.id}`,
                    {
                        apiKey: globalOpts.apiKey,
                        baseUrl: globalOpts.baseUrl,
                        dryRun: globalOpts.dryRun,
                        verbose: globalOpts.verbose,
                    }
                );
                console.log(`✓ Version ${opts.id} deleted.`);
            } catch (error) {
                printError(error);
                process.exit(1);
            }
        });

    // ── clone ──
    versions
        .command('clone')
        .description('Clone (duplicate) a policy version')
        .requiredOption('--group-id <groupId>', 'Policy group ID')
        .requiredOption('--id <versionId>', 'Source version ID to clone')
        .action(async (opts) => {
            try {
                const globalOpts = program.opts();
                const data = await apiRequest<PolicyVersionSummary>(
                    'POST',
                    `policy-groups/${opts.groupId}/versions/${opts.id}/clone`,
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

// ── Helpers ──

function buildCreateBody(opts: Record<string, string | undefined>): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    if (opts.commitMessage) body.commitMessage = opts.commitMessage;
    if (opts.effectiveFrom) body.effectiveFrom = opts.effectiveFrom;
    if (opts.effectiveTo) body.effectiveTo = opts.effectiveTo;
    return body;
}

function buildUpdateBody(opts: Record<string, string | undefined>): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    if (opts.commitMessage) body.commitMessage = opts.commitMessage;
    if (opts.effectiveFrom) body.effectiveFrom = opts.effectiveFrom;
    if (opts.effectiveTo) body.effectiveTo = opts.effectiveTo;
    return body;
}