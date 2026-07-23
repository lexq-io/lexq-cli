import { type Command } from 'commander';
import dedent from 'dedent';
import { apiRequest } from '@/lib/api-client';
import type { PageResponse, UnregisteredFact } from '@/types/api';
import {
  printJson,
  printTable,
  printError,
  printUnregisteredFactsWarning,
  type OutputFormat,
} from '@/lib/output';
import type {
  DeploymentSummary,
  DeploymentDetail,
  DeploymentStatus,
  DeploymentSchedule,
  PublishRequest,
  DeployRequest,
  RollbackRequest,
  UndeployRequest,
  ScheduleRequest,
} from '@/types/deploy';

export function registerDeployCommands(program: Command): void {
  const deploy = program
    .command('deploy')
    .description('Deployment lifecycle and history')
    .addHelpText(
      'after',
      dedent`

        Lifecycle: Publish (DRAFT→ACTIVE) → Deploy or Schedule (ACTIVE→LIVE) → Rollback / Undeploy

        Commands:
          publish     Lock a DRAFT version (DRAFT → ACTIVE)
          live        Push an ACTIVE version to production traffic
          rollback    Revert to the previous deployed version
          undeploy    Remove the live version (stops all traffic)
          schedule    Schedule an ACTIVE version to auto-deploy at its effective start
          unschedule  Cancel the pending scheduled deployment
          schedules   List scheduled deployments (all statuses)
          history     List deployment history with filters
          detail      Get deployment detail with integrity check
          overview    Show all groups' deployment status at a glance
          deployable  List ACTIVE versions available for deployment
          diff        Compare rule snapshots between two versions

        Always dry-run before publishing. Cannot deploy a DRAFT — publish first.
      `,
    );

  // ── publish ──
  deploy
    .command('publish')
    .description('Publish a DRAFT version (DRAFT → ACTIVE)')
    .requiredOption('--group-id <groupId>', 'Policy group ID')
    .requiredOption('--version-id <versionId>', 'Version ID to publish')
    .requiredOption('--memo <memo>', 'Publish Deployment memo')
    .addHelpText(
      'after',
      dedent`

        Locks the version permanently. Rules cannot be modified after publishing.
        A snapshot hash is generated for integrity verification.

        Example:
          $ lexq deploy publish --group-id <gid> --version-id <vid> --memo "Validated via dry-run"
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        await warnUnregisteredFacts(globalOpts, opts.groupId, opts.versionId);
        await apiRequest<void>(
          'POST',
          `policy-groups/${opts.groupId}/versions/${opts.versionId}/publish`,
          {
            apiKey: globalOpts.apiKey,
            baseUrl: globalOpts.baseUrl,
            dryRun: globalOpts.dryRun,
            verbose: globalOpts.verbose,
            body: { memo: opts.memo } satisfies PublishRequest,
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
    .requiredOption('--memo <memo>', 'Live Deployment memo')
    .addHelpText(
      'after',
      dedent`

        Takes effect immediately. The version starts receiving production traffic.

        Example:
          $ lexq deploy live --group-id <gid> --version-id <vid> --memo "Go live — v3"
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        await warnUnregisteredFacts(globalOpts, opts.groupId, opts.versionId);
        await apiRequest<void>('POST', `policy-groups/${opts.groupId}/deploy`, {
          apiKey: globalOpts.apiKey,
          baseUrl: globalOpts.baseUrl,
          dryRun: globalOpts.dryRun,
          verbose: globalOpts.verbose,
          body: { versionId: opts.versionId, memo: opts.memo } satisfies DeployRequest,
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
    .requiredOption('--memo <memo>', 'Rollback reason')
    .option('--force', 'Skip confirmation prompt')
    .addHelpText(
      'after',
      dedent`

        Reverts to the version that was live before the current one.
        Only available if the previous version is still ACTIVE.

        Example:
          $ lexq deploy rollback --group-id <gid> --memo "High error rate" --force
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();

        if (!opts.force) {
          const { createInterface } = await import('node:readline/promises');
          const rl = createInterface({ input: process.stdin, output: process.stdout });
          const answer = await rl.question(`Rollback group ${opts.groupId}? [y/N] `);
          rl.close();
          if (answer.toLowerCase() !== 'y') {
            console.log('Canceled.');
            return;
          }
        }

        await apiRequest<void>('POST', `policy-groups/${opts.groupId}/rollback`, {
          apiKey: globalOpts.apiKey,
          baseUrl: globalOpts.baseUrl,
          dryRun: globalOpts.dryRun,
          verbose: globalOpts.verbose,
          body: { memo: opts.memo } satisfies RollbackRequest,
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
    .requiredOption('--memo <memo>', 'Undeploy reason')
    .option('--force', 'Skip confirmation prompt')
    .addHelpText(
      'after',
      dedent`

        Stops all traffic processing for this group until a new version is deployed.

        Example:
          $ lexq deploy undeploy --group-id <gid> --memo "Maintenance window" --force
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();

        if (!opts.force) {
          const { createInterface } = await import('node:readline/promises');
          const rl = createInterface({ input: process.stdin, output: process.stdout });
          const answer = await rl.question(`Undeploy group ${opts.groupId}? [y/N] `);
          rl.close();
          if (answer.toLowerCase() !== 'y') {
            console.log('Canceled.');
            return;
          }
        }

        await apiRequest<void>('POST', `policy-groups/${opts.groupId}/undeploy`, {
          apiKey: globalOpts.apiKey,
          baseUrl: globalOpts.baseUrl,
          dryRun: globalOpts.dryRun,
          verbose: globalOpts.verbose,
          body: { memo: opts.memo } satisfies UndeployRequest,
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
    .option('--types <types>', 'Filter by types (comma-separated: DEPLOY,ROLLBACK,UNDEPLOY)')
    .option('--start-date <date>', 'Start date (yyyy-MM-dd)')
    .option('--end-date <date>', 'End date (yyyy-MM-dd)')
    .option('--page <number>', 'Page number', '0')
    .option('--size <number>', 'Page size', '20')
    .addHelpText(
      'after',
      dedent`

        Example:
          $ lexq deploy history --group-id <gid> --types DEPLOY,ROLLBACK --format table
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const format: OutputFormat = globalOpts.format ?? 'json';

        const params: Record<string, string> = { page: opts.page, size: opts.size };
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
    .addHelpText(
      'after',
      dedent`

        Includes snapshot hash and integrity check (hashValid field).
      `,
    )
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
    .addHelpText(
      'after',
      dedent`

        Shows which version is live for each group, who deployed it, and when.

        Example:
          $ lexq deploy overview --format table
      `,
    )
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
    .addHelpText(
      'after',
      dedent`

        Shows ACTIVE versions that can be deployed. Only published versions appear here.
      `,
    )
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
    .addHelpText(
      'after',
      dedent`

        Shows added, removed, and modified rules between two versions.

        Example:
          $ lexq deploy diff --base <v1-id> --target <v2-id>
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const data = await apiRequest<unknown>('GET', 'deployments/diff', {
          apiKey: globalOpts.apiKey,
          baseUrl: globalOpts.baseUrl,
          dryRun: globalOpts.dryRun,
          verbose: globalOpts.verbose,
          params: { baseVersionId: opts.base, targetVersionId: opts.target },
        });
        printJson(data);
      } catch (error) {
        printError(error);
        process.exit(1);
      }
    });

  // ── schedule ──
  deploy
    .command('schedule')
    .description('Schedule an ACTIVE version to auto-deploy at its effective start')
    .requiredOption('--group-id <groupId>', 'Policy group ID')
    .requiredOption('--version-id <versionId>', 'Version ID to schedule')
    .requiredOption('--memo <memo>', 'Schedule memo')
    .addHelpText(
      'after',
      dedent`

        The version must be ACTIVE with a future effective start date; the system
        deploys it automatically at that time (within one scheduler tick, ≤60s).
        One pending schedule per group. Manual deploy/rollback/undeploy, starting
        an A/B test, or archiving the group cancels the pending schedule.

        Example:
          $ lexq deploy schedule --group-id <gid> --version-id <vid> --memo "Q4 pricing"
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const data = await apiRequest<DeploymentSchedule>(
          'POST',
          `policy-groups/${opts.groupId}/schedule`,
          {
            apiKey: globalOpts.apiKey,
            baseUrl: globalOpts.baseUrl,
            dryRun: globalOpts.dryRun,
            verbose: globalOpts.verbose,
            body: { versionId: opts.versionId, memo: opts.memo } satisfies ScheduleRequest,
          },
        );
        console.log(`✓ Scheduled v${data.versionNo ?? '?'} for ${data.scheduledFor}.`);
      } catch (error) {
        printError(error);
        process.exit(1);
      }
    });

  // ── unschedule ──
  deploy
    .command('unschedule')
    .description('Cancel the pending scheduled deployment for a group')
    .requiredOption('--group-id <groupId>', 'Policy group ID')
    .option('--force', 'Skip confirmation prompt')
    .addHelpText(
      'after',
      dedent`

        Cancels the PENDING schedule only — the version itself is not affected.

        Example:
          $ lexq deploy unschedule --group-id <gid> --force
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();

        if (!opts.force) {
          const { createInterface } = await import('node:readline/promises');
          const rl = createInterface({ input: process.stdin, output: process.stdout });
          const answer = await rl.question(
            `Cancel the pending scheduled deployment for group ${opts.groupId}? [y/N] `,
          );
          rl.close();
          if (answer.toLowerCase() !== 'y') {
            console.log('Canceled.');
            return;
          }
        }

        await apiRequest<void>('DELETE', `policy-groups/${opts.groupId}/schedule`, {
          apiKey: globalOpts.apiKey,
          baseUrl: globalOpts.baseUrl,
          dryRun: globalOpts.dryRun,
          verbose: globalOpts.verbose,
        });
        console.log(`✓ Scheduled deployment canceled for group ${opts.groupId}.`);
      } catch (error) {
        printError(error);
        process.exit(1);
      }
    });

  // ── schedules ──
  deploy
    .command('schedules')
    .description('List scheduled deployments (all statuses, newest first)')
    .option('--page <number>', 'Page number', '0')
    .option('--size <number>', 'Page size', '20')
    .addHelpText(
      'after',
      dedent`

        Example:
          $ lexq deploy schedules --format table
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const format: OutputFormat = globalOpts.format ?? 'json';

        const data = await apiRequest<PageResponse<DeploymentSchedule>>(
          'GET',
          'policy-groups/schedules',
          {
            apiKey: globalOpts.apiKey,
            baseUrl: globalOpts.baseUrl,
            dryRun: globalOpts.dryRun,
            verbose: globalOpts.verbose,
            params: { page: opts.page, size: opts.size },
          },
        );

        if (format === 'table') {
          printTable(
            ['Status', 'Group', 'Version', 'Scheduled For', 'By', 'Result'],
            data.content.map((s) => [
              s.status,
              s.policyGroupName ?? s.policyGroupId.substring(0, 8),
              s.versionNo != null ? `v${s.versionNo}` : '–',
              s.scheduledFor.substring(0, 16),
              s.scheduledByName,
              s.status === 'EXECUTED'
                ? (s.executedAt?.substring(0, 16) ?? '–')
                : s.status === 'CANCELED'
                  ? (s.canceledReason ?? '–')
                  : s.status === 'FAILED'
                    ? (s.failedReason ?? '–')
                    : '–',
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
}

/** publish/live 전 미등록 fact 사전 경고(비차단·best-effort). dry-run 시 실호출 금지 위해 생략. */
async function warnUnregisteredFacts(
  globalOpts: { apiKey?: string; baseUrl?: string; dryRun?: boolean; verbose?: boolean },
  groupId: string,
  versionId: string,
): Promise<void> {
  if (globalOpts.dryRun) return;
  try {
    const facts = await apiRequest<UnregisteredFact[]>(
      'GET',
      `policy-groups/${groupId}/versions/${versionId}/unregistered-facts`,
      { apiKey: globalOpts.apiKey, baseUrl: globalOpts.baseUrl, verbose: globalOpts.verbose },
    );
    printUnregisteredFactsWarning(facts);
  } catch {
    // 사전 경고 실패가 배포를 막지 않는다 (INV-4)
  }
}
