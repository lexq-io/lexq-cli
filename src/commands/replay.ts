import { type Command } from 'commander';
import dedent from 'dedent';
import { apiRequest } from '@/lib/api-client';
import type { PageResponse } from '@/types/api';
import { printJson, printTable, printError, type OutputFormat } from '@/lib/output';
import type { DecisionReplayResponse, ReplayJobListItem } from '@/types/replay';

export function registerReplayCommands(program: Command): void {
  const replay = program
    .command('replay')
    .description('Decision Replay')
    .addHelpText(
      'after',
      dedent`

        Re-evaluate past production executions against a candidate version.

        Commands:
          decision  Replay one execution and show the decision diff (sync, free)
          start     Submit a window replay job — blast radius (async, billed)
          list      List replay job history
          get       Poll a job's status, summary, and changed samples
          cancel    Cancel a PENDING/RUNNING job

        External effects (webhooks, notifications) are always mocked during replay.
      `,
    );

  // ── decision ──
  replay
    .command('decision')
    .description('Replay a single execution against a candidate version')
    .requiredOption('--trace-id <traceId>', 'Trace ID of the past execution')
    .requiredOption('--version-id <versionId>', 'Candidate version to re-evaluate against')
    .addHelpText(
      'after',
      dedent`

        Free of charge (TPS throttle only). Returns decisionChanged, effect
        changes, fired rules on both sides, and a determinism verdict.

        Example:
          $ lexq replay decision --trace-id <tid> --version-id <vid>
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const data = await apiRequest<DecisionReplayResponse>('POST', 'replay/decisions', {
          apiKey: globalOpts.apiKey,
          baseUrl: globalOpts.baseUrl,
          dryRun: globalOpts.dryRun,
          verbose: globalOpts.verbose,
          body: { traceId: opts.traceId, candidateVersionId: opts.versionId },
        });
        printJson(data);
      } catch (error) {
        printError(error);
        process.exit(1);
      }
    });

  // ── start ──
  replay
    .command('start')
    .description('Submit a window replay job (blast radius)')
    .requiredOption('--version-id <versionId>', 'Candidate version to re-evaluate against')
    .requiredOption('--from <date>', 'Window start date (yyyy-MM-dd)')
    .requiredOption('--to <date>', 'Window end date (yyyy-MM-dd)')
    .option('--max-records <number>', 'Sample cap (hard cap 50k)')
    .addHelpText(
      'after',
      dedent`

        Billed per replayed record (REPLAY metric). Poll with "lexq replay get".

        Example:
          $ lexq replay start --version-id <vid> --from 2026-06-01 --to 2026-06-30
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const body: Record<string, unknown> = {
          candidateVersionId: opts.versionId,
          from: opts.from,
          to: opts.to,
        };
        if (opts.maxRecords) body.maxRecords = Number(opts.maxRecords);

        const data = await apiRequest('POST', 'replay/jobs', {
          apiKey: globalOpts.apiKey,
          baseUrl: globalOpts.baseUrl,
          dryRun: globalOpts.dryRun,
          verbose: globalOpts.verbose,
          body,
        });
        printJson(data);
      } catch (error) {
        printError(error);
        process.exit(1);
      }
    });

  // ── list ──
  replay
    .command('list')
    .description('List replay jobs')
    .option('--page <number>', 'Page number', '0')
    .option('--size <number>', 'Page size', '20')
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const format: OutputFormat = globalOpts.format ?? 'json';

        const data = await apiRequest<PageResponse<ReplayJobListItem>>('GET', 'replay/jobs', {
          apiKey: globalOpts.apiKey,
          baseUrl: globalOpts.baseUrl,
          dryRun: globalOpts.dryRun,
          verbose: globalOpts.verbose,
          params: { page: opts.page, size: opts.size },
        });

        if (format === 'table') {
          printTable(
            ['Job', 'Version', 'Window', 'Status', 'Progress', 'Changed', 'At'],
            data.content.map((j) => [
              j.jobId.substring(0, 12),
              j.candidateVersionName ?? '–',
              `${j.fromDate}~${j.toDate}`,
              j.status,
              `${j.progress}%`,
              `${j.changedCount}${j.capped ? ' (capped)' : ''}`,
              j.createdAt.substring(0, 16),
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
  replay
    .command('get')
    .description('Get replay job status and results')
    .requiredOption('--id <jobId>', 'Replay job ID')
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const data = await apiRequest('GET', `replay/jobs/${opts.id}`, {
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

  // ── cancel ──
  replay
    .command('cancel')
    .description('Cancel a PENDING/RUNNING replay job')
    .requiredOption('--id <jobId>', 'Replay job ID')
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const data = await apiRequest('POST', `replay/jobs/${opts.id}/cancel`, {
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
