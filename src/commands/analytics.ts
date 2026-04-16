import { readFileSync, writeFileSync } from 'node:fs';
import { type Command } from 'commander';
import dedent from 'dedent';
import { apiRequest } from '@/lib/api-client';
import type { PageResponse } from '@/types/api';
import { printJson, printTable, printError, type OutputFormat } from '@/lib/output';
import type {
  DatasetUploadResponse,
  DryRunCompareResponse,
  DryRunResponse,
  RequirementsResponse,
  SimulationHistoryResponse,
  SimulationResponse,
} from '@/types/analytics';
import { loadConfig } from '@/lib/config';

export function registerAnalyticsCommands(program: Command): void {
  const analytics = program
    .command('analytics')
    .description('Dry run, simulation, and requirements')
    .addHelpText(
      'after',
      dedent`

        Test and validate rules before deploying to production.

        Commands:
          dry-run          Test a single input against a version
          dry-run-compare  Compare results between two versions
          requirements     Show required input facts for a version
          simulation       Batch test against historical data (start, status, list, cancel, export)
          dataset          Upload datasets and download templates

        Workflow: facts check → dry-run → publish → simulation → deploy
      `,
    );

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
    .addHelpText(
      'after',
      dedent`

        Examples:
          $ lexq analytics dry-run --version-id <vid> --debug --mock \\
              --json '{"facts": {"payment_amount": 150000, "customer_tier": "VIP"}}'

          $ lexq analytics dry-run --version-id <vid> --file test-input.json

        The request body must include a "facts" object. Use --debug for execution traces
        and --mock to skip external service calls (webhooks, coupons, etc.).
      `,
    )
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
          },
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
    .addHelpText(
      'after',
      dedent`

        Example:
          $ lexq analytics dry-run-compare --json '{
              "versionIdA": "<version-a-id>",
              "versionIdB": "<version-b-id>",
              "facts": {"payment_amount": 100000, "customer_tier": "VIP"}
            }'

        Shows side-by-side which rules matched and what actions fired for each version.
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const body = resolveBody(opts);

        if (!body.facts || !body.versionIdA || !body.versionIdB) {
          throw new Error(
            'Request body must include "facts", "versionIdA", "versionIdB". Use --json or --file.',
          );
        }

        const data = await apiRequest<DryRunCompareResponse>('POST', 'analytics/dry-run/compare', {
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

  // ══════════════════════════════════════════════════
  // Requirements
  // ══════════════════════════════════════════════════

  analytics
    .command('requirements')
    .description('Analyze required input facts for a version')
    .requiredOption('--group-id <groupId>', 'Policy group ID')
    .requiredOption('--version-id <versionId>', 'Policy version ID')
    .addHelpText(
      'after',
      dedent`

        Shows all facts referenced in conditions and actions, along with an example request body.

        Example:
          $ lexq analytics requirements --group-id <gid> --version-id <vid> --format table
      `,
    )
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
          },
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
            ]),
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

  const sim = analytics
    .command('simulation')
    .description('Manage batch simulations')
    .addHelpText(
      'after',
      dedent`

        Batch-test a version against historical data or uploaded datasets.

        Commands:
          start     Start a new simulation
          status    Check progress and results
          list      List simulation history
          cancel    Cancel a running simulation
          export    Export results as CSV or JSON

        Simulations always mock external calls. Use --format table for summary view.
      `,
    );

  // ── start ──
  sim
    .command('start')
    .description('Start a new batch simulation')
    .requiredOption('--json <body>', 'Simulation request body as JSON')
    .option('--file <path>', 'Read request body from a JSON file')
    .addHelpText(
      'after',
      dedent`

        Example:
          $ lexq analytics simulation start --json '{
              "policyVersionId": "<vid>",
              "dataset": {
                "type": "EXECUTION_LOG",
                "source": "RECENT",
                "maxRecords": 1000
              },
              "options": {
                "baselinePolicyVersionId": "<baseline-vid>",
                "includeRuleStats": true
              }
            }'

        Dataset types: EXECUTION_LOG, MANUAL
        Dataset sources: RECENT, DATE_RANGE, MANUAL
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const body = resolveBody(opts);

        const data = await apiRequest<SimulationResponse>('POST', 'analytics/simulations', {
          apiKey: globalOpts.apiKey,
          baseUrl: globalOpts.baseUrl,
          dryRun: globalOpts.dryRun,
          verbose: globalOpts.verbose,
          body,
        });
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
    .addHelpText(
      'after',
      dedent`

        Shows progress, match rate, metric comparison (if baseline set), and per-rule stats.

        Example:
          $ lexq analytics simulation status --id <simId> --format table
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const format: OutputFormat = globalOpts.format ?? 'json';

        const data = await apiRequest<SimulationResponse>(
          'GET',
          `analytics/simulations/${opts.id}`,
          {
            apiKey: globalOpts.apiKey,
            baseUrl: globalOpts.baseUrl,
            dryRun: globalOpts.dryRun,
            verbose: globalOpts.verbose,
          },
        );

        if (format === 'table') {
          console.log(`Status:     ${data.status}`);
          console.log(`Progress:   ${data.progress}%`);

          if (data.summary) {
            console.log(`\n── Summary ──`);
            console.log(`Records:    ${data.summary.totalRecords.toLocaleString()}`);
            console.log(`Matched:    ${data.summary.matchedRecords.toLocaleString()}`);
            console.log(`Match Rate: ${data.summary.matchRate.toFixed(1)}%`);
            console.log(`Time:       ${data.summary.executionTimeMs.toLocaleString()}ms`);
          }

          if (data.metricSummary) {
            console.log(
              `\n── Metric: ${data.metricSummary.targetVariable} (${data.metricSummary.aggregationType}) ──`,
            );
            console.log(`Baseline:   ${data.metricSummary.baselineValue.toLocaleString()}`);
            console.log(`Simulated:  ${data.metricSummary.simulatedValue.toLocaleString()}`);
            console.log(
              `Delta:      ${data.metricSummary.delta > 0 ? '+' : ''}${data.metricSummary.delta.toLocaleString()}`,
            );
            console.log(
              `Change:     ${data.metricSummary.deltaPercentage > 0 ? '+' : ''}${data.metricSummary.deltaPercentage.toFixed(1)}%`,
            );
          }

          if (data.policyImpact?.comparison) {
            const diff = data.policyImpact.comparison.difference;
            console.log(`\n── Impact ──`);
            console.log(
              `Matched Δ:  ${diff.matchedCountDelta > 0 ? '+' : ''}${diff.matchedCountDelta}`,
            );
            console.log(
              `Rate Δ:     ${diff.matchedRateDelta > 0 ? '+' : ''}${diff.matchedRateDelta.toFixed(1)}%`,
            );
            console.log(
              `Metric Δ:   ${diff.metricValueDelta > 0 ? '+' : ''}${diff.metricValueDelta.toLocaleString()}`,
            );
          }

          if (data.ruleStats?.length) {
            console.log('');
            printTable(
              ['Rule', 'Matched', 'Metric'],
              data.ruleStats.map((r) => [
                r.ruleName,
                r.matchedCount.toLocaleString(),
                r.metricValue.toLocaleString(),
              ]),
              { truncate: 30 },
            );
          }
        } else {
          printJson(data);
        }
      } catch (error) {
        printError(error);
        process.exit(1);
      }
    });

  // ── list ──
  sim
    .command('list')
    .description('List simulation history')
    .option(
      '--status <status>',
      'Filter by status (PENDING, RUNNING, COMPLETED, FAILED, CANCELLED)',
    )
    .option('--from <date>', 'Start date (yyyy-MM-dd)')
    .option('--to <date>', 'End date (yyyy-MM-dd)')
    .option('--page <number>', 'Page number', '0')
    .option('--size <number>', 'Page size', '20')
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const format: OutputFormat = globalOpts.format ?? 'json';

        const params: Record<string, string> = { page: opts.page, size: opts.size };
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
          },
        );

        if (format === 'table') {
          printTable(
            ['ID', 'Group', 'Target', 'Status', 'Match', 'Records', 'Created'],
            data.content.map((s) => [
              s.simulationId.substring(0, 8),
              s.policyGroupName,
              s.targetVersionName ?? '–',
              s.status,
              `${s.matchRate.toFixed(1)}%`,
              String(s.totalRecords),
              s.createdAt.substring(0, 16),
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

  // ── cancel ──
  sim
    .command('cancel')
    .description('Cancel a running simulation')
    .requiredOption('--id <simulationId>', 'Simulation ID')
    .option('--force', 'Skip confirmation prompt')
    .addHelpText(
      'after',
      dedent`

        Only PENDING or RUNNING simulations can be cancelled.
      `,
    )
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

        await apiRequest<void>('DELETE', `analytics/simulations/${opts.id}`, {
          apiKey: globalOpts.apiKey,
          baseUrl: globalOpts.baseUrl,
          dryRun: globalOpts.dryRun,
          verbose: globalOpts.verbose,
        });
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
    .addHelpText(
      'after',
      dedent`

        Only COMPLETED simulations can be exported.

        Examples:
          $ lexq analytics simulation export --id <simId> --format csv --output results.csv
          $ lexq analytics simulation export --id <simId> --format json
      `,
    )
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
          },
        );

        if (opts.output) {
          const text = typeof response === 'string' ? response : JSON.stringify(response, null, 2);
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

  // ══════════════════════════════════════════════════
  // Dataset
  // ══════════════════════════════════════════════════

  const dataset = analytics
    .command('dataset')
    .description('Upload datasets and download templates')
    .addHelpText(
      'after',
      dedent`

        Commands:
          upload    Upload a CSV or JSON file as a simulation dataset
          template  Download a dataset template based on version requirements
      `,
    );

  // ── upload ──
  dataset
    .command('upload')
    .description('Upload a CSV or JSON file as a simulation dataset')
    .requiredOption('--file <path>', 'Path to CSV or JSON file')
    .addHelpText(
      'after',
      dedent`

        Supported formats: CSV (with header row), JSON (array of objects).
        Use "dataset template" to generate a correctly formatted template.

        Example:
          $ lexq analytics dataset upload --file transactions.csv
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const config = loadConfig();
        const baseUrl = globalOpts.baseUrl ?? config.baseUrl;
        const apiKey = globalOpts.apiKey ?? config.apiKey;

        if (!apiKey) {
          throw new Error('Not authenticated. Run "lexq auth login" first.');
        }

        const filePath = opts.file as string;
        const fileBuffer = readFileSync(filePath);
        const fileName = filePath.split('/').pop() ?? 'dataset';

        const ext = fileName.split('.').pop()?.toLowerCase();
        let contentType = 'application/octet-stream';
        if (ext === 'csv') contentType = 'text/csv';
        else if (ext === 'json') contentType = 'application/json';

        const blob = new Blob([fileBuffer], { type: contentType });
        const formData = new FormData();
        formData.append('file', blob, fileName);

        const url = new URL(
          'analytics/datasets/upload',
          baseUrl.endsWith('/') ? baseUrl : baseUrl + '/',
        );

        if (globalOpts.verbose) {
          console.error(`→ POST ${url.toString()}`);
          console.error(`  File: ${filePath} (${fileBuffer.length} bytes)`);
        }

        const response = await fetch(url.toString(), {
          method: 'POST',
          headers: { 'X-API-KEY': apiKey },
          body: formData,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Upload failed (${response.status}): ${errorText}`);
        }

        const envelope = (await response.json()) as { data: DatasetUploadResponse };
        const result = envelope.data;
        console.log(`✓ Dataset uploaded: ${result.path}`);
        console.log(`  File: ${result.filename} (${result.size} bytes)`);
        printJson(result);
      } catch (error) {
        printError(error);
        process.exit(1);
      }
    });

  // ── template ──
  dataset
    .command('template')
    .description('Download a dataset template based on version requirements')
    .requiredOption('--group-id <groupId>', 'Policy group ID')
    .requiredOption('--version-id <versionId>', 'Policy version ID')
    .option('--format <fmt>', 'Template format: csv or json', 'csv')
    .option('--output <path>', 'Output file path')
    .addHelpText(
      'after',
      dedent`

        Generates a template with all required fact columns pre-filled.

        Examples:
          $ lexq analytics dataset template --group-id <gid> --version-id <vid> --output template.csv
          $ lexq analytics dataset template --group-id <gid> --version-id <vid> --format json
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const config = loadConfig();
        const baseUrl = globalOpts.baseUrl ?? config.baseUrl;
        const apiKey = globalOpts.apiKey ?? config.apiKey;

        if (!apiKey) {
          throw new Error('Not authenticated. Run "lexq auth login" first.');
        }

        const fmt = opts.format === 'json' ? 'json' : 'csv';
        const url = new URL(
          `analytics/groups/${opts.groupId}/versions/${opts.versionId}/dataset-template`,
          baseUrl.endsWith('/') ? baseUrl : baseUrl + '/',
        );
        url.searchParams.set('format', fmt);

        const response = await fetch(url.toString(), {
          headers: { 'X-API-KEY': apiKey, Accept: '*/*' },
        });

        if (!response.ok) {
          throw new Error(`Template download failed (${response.status})`);
        }

        const text = await response.text();

        if (opts.output) {
          writeFileSync(opts.output as string, text, 'utf-8');
          console.log(`✓ Template saved to ${opts.output}`);
        } else {
          console.log(text);
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
