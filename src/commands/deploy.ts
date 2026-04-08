import { type Command } from 'commander';
import { apiRequest } from '@/lib/api-client';
import type { PageResponse } from '@/types/api';
import { printJson, printTable, printError, type OutputFormat } from '@/lib/output';
import type { DeploymentSummary, DeploymentDetail, DeploymentStatus } from '@/types/deploy';

export function registerDeployCommands(program: Command): void {
  const deploy = program.command('deploy').description('Deployment lifecycle and history');

  // ── publish ──
  deploy
    .command('publish')
    .description('Publish a DRAFT version (DRAFT → ACTIVE)')
    .requiredOption('--group-id <groupId>', 'Policy group ID')
    .requiredOption('--version-id <versionId>', 'Version ID to publish')
    .option('--memo <memo>', 'Deployment memo')
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        await apiRequest<void>(
          'POST',
          `policy-groups/${opts.groupId}/versions/${opts.versionId}/publish`,
          {
            apiKey: globalOpts.apiKey,
            baseUrl: globalOpts.baseUrl,
            dryRun: globalOpts.dryRun,
            verbose: globalOpts.verbose,
            body: { memo: opts.memo ?? '' },
          },
        );
        console.log(`✓ Version ${opts.versionId} published.`);
      } catch (error) {
        printError(error);
        process.exit(1);
      }
    });

  // ── live ──
  deploy
    .command('live')
    .description('Deploy an ACTIVE version to live traffic')
    .requiredOption('--group-id <groupId>', 'Policy group ID')
    .requiredOption('--version-id <versionId>', 'Version ID to deploy')
    .option('--memo <memo>', 'Deployment memo')
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        await apiRequest<void>('POST', `policy-groups/${opts.groupId}/deploy`, {
          apiKey: globalOpts.apiKey,
          baseUrl: globalOpts.baseUrl,
          dryRun: globalOpts.dryRun,
          verbose: globalOpts.verbose,
          body: { versionId: opts.versionId, memo: opts.memo ?? '' },
        });
        console.log(`✓ Version ${opts.versionId} deployed to live.`);
      } catch (error) {
        printError(error);
        process.exit(1);
      }
    });

  // ── rollback ──
  deploy
    .command('rollback')
    .description('Rollback to the previous deployed version')
    .requiredOption('--group-id <groupId>', 'Policy group ID')
    .option('--memo <memo>', 'Rollback reason')
    .option('--force', 'Skip confirmation prompt')
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();

        if (!opts.force) {
          const { createInterface } = await import('node:readline/promises');
          const rl = createInterface({ input: process.stdin, output: process.stdout });
          const answer = await rl.question(`Rollback group ${opts.groupId}? [y/N] `);
          rl.close();
          if (answer.toLowerCase() !== 'y') {
            console.log('Cancelled.');
            return;
          }
        }

        await apiRequest<void>('POST', `policy-groups/${opts.groupId}/rollback`, {
          apiKey: globalOpts.apiKey,
          baseUrl: globalOpts.baseUrl,
          dryRun: globalOpts.dryRun,
          verbose: globalOpts.verbose,
          body: { memo: opts.memo ?? '' },
        });
        console.log(`✓ Group ${opts.groupId} rolled back.`);
      } catch (error) {
        printError(error);
        process.exit(1);
      }
    });

  // ── undeploy ──
  deploy
    .command('undeploy')
    .description('Remove the live version from a group')
    .requiredOption('--group-id <groupId>', 'Policy group ID')
    .option('--memo <memo>', 'Undeploy reason')
    .option('--force', 'Skip confirmation prompt')
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();

        if (!opts.force) {
          const { createInterface } = await import('node:readline/promises');
          const rl = createInterface({ input: process.stdin, output: process.stdout });
          const answer = await rl.question(`Undeploy group ${opts.groupId}? [y/N] `);
          rl.close();
          if (answer.toLowerCase() !== 'y') {
            console.log('Cancelled.');
            return;
          }
        }

        await apiRequest<void>('POST', `policy-groups/${opts.groupId}/undeploy`, {
          apiKey: globalOpts.apiKey,
          baseUrl: globalOpts.baseUrl,
          dryRun: globalOpts.dryRun,
          verbose: globalOpts.verbose,
          body: { memo: opts.memo ?? '' },
        });
        console.log(`✓ Group ${opts.groupId} undeployed.`);
      } catch (error) {
        printError(error);
        process.exit(1);
      }
    });

  // ── history ──
  deploy
    .command('history')
    .description('List deployment history')
    .option('--group-id <groupId>', 'Filter by policy group')
    .option(
      '--types <types>',
      'Filter by types (comma-separated: PUBLISH,DEPLOY,ROLLBACK,UNDEPLOY)',
    )
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
        if (opts.groupId) params.groupId = opts.groupId;
        if (opts.types) params.types = opts.types;
        if (opts.startDate) params.startDate = opts.startDate;
        if (opts.endDate) params.endDate = opts.endDate;

        const data = await apiRequest<PageResponse<DeploymentSummary>>('GET', 'deployments', {
          apiKey: globalOpts.apiKey,
          baseUrl: globalOpts.baseUrl,
          dryRun: globalOpts.dryRun,
          verbose: globalOpts.verbose,
          params,
        });

        if (format === 'table') {
          printTable(
            ['ID', 'Type', 'Group', 'Version', 'By', 'At'],
            data.content.map((d) => [
              d.id.substring(0, 8),
              d.deploymentType,
              d.policyGroupName,
              d.versionNo != null ? `v${d.versionNo}` : '–',
              d.deployedByName,
              d.deployedAt.substring(0, 16),
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

  // ── detail ──
  deploy
    .command('detail')
    .description('Get deployment detail')
    .requiredOption('--id <deploymentId>', 'Deployment ID')
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const data = await apiRequest<DeploymentDetail>('GET', `deployments/${opts.id}`, {
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

  // ── overview ──
  deploy
    .command('overview')
    .description('Show deployment status overview for all groups')
    .action(async () => {
      try {
        const globalOpts = program.opts();
        const format: OutputFormat = globalOpts.format ?? 'json';

        const data = await apiRequest<DeploymentStatus[]>('GET', 'deployments/overview', {
          apiKey: globalOpts.apiKey,
          baseUrl: globalOpts.baseUrl,
          dryRun: globalOpts.dryRun,
          verbose: globalOpts.verbose,
        });

        if (format === 'table') {
          printTable(
            ['Group', 'Name', 'Status', 'Current Version', 'Last Deploy'],
            data.map((d) => [
              d.groupId.substring(0, 8),
              d.groupName,
              d.groupStatus,
              d.currentVersionName ?? '–',
              d.lastDeployedAt?.substring(0, 16) ?? '–',
            ]),
          );
        } else {
          printJson(data);
        }
      } catch (error) {
        printError(error);
        process.exit(1);
      }
    });

  // ── deployable ──
  deploy
    .command('deployable')
    .description('List deployable (ACTIVE) versions for a group')
    .requiredOption('--group-id <groupId>', 'Policy group ID')
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const data = await apiRequest<unknown[]>(
          'GET',
          `deployments/groups/${opts.groupId}/deployable-versions`,
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

  // ── diff ──
  deploy
    .command('diff')
    .description('Compare snapshot diff between two versions')
    .requiredOption('--base <versionId>', 'Base version ID')
    .requiredOption('--target <versionId>', 'Target version ID')
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const data = await apiRequest<unknown>('GET', 'deployments/diff', {
          apiKey: globalOpts.apiKey,
          baseUrl: globalOpts.baseUrl,
          dryRun: globalOpts.dryRun,
          verbose: globalOpts.verbose,
          params: {
            baseVersionId: opts.base,
            targetVersionId: opts.target,
          },
        });
        printJson(data);
      } catch (error) {
        printError(error);
        process.exit(1);
      }
    });
}
