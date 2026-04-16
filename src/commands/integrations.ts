import { type Command } from 'commander';
import dedent from 'dedent';
import { apiRequest } from '@/lib/api-client';
import type { PageResponse } from '@/types/api';
import { printJson, printTable, printError, type OutputFormat } from '@/lib/output';
import type { IntegrationResponse, IntegrationConfigSpecs } from '@/types/integrations';

export function registerIntegrationCommands(program: Command): void {
  const integrations = program
    .command('integrations')
    .description('Manage external integrations')
    .addHelpText(
      'after',
      dedent`

        Integrations connect rule actions to external services (webhooks, coupons,
        points, notifications, CRM, messengers).

        Commands:
          list         List all integrations
          get          Get integration detail
          save         Create or update an integration
          delete       Delete an integration
          config-spec  Show required configuration fields per type

        Types: COUPON, POINT, NOTIFICATION, CRM, MESSENGER, WEBHOOK
      `,
    );

  // ── list ──
  integrations
    .command('list')
    .description('List integrations')
    .option(
      '--type <type>',
      'Filter by type (COUPON, POINT, NOTIFICATION, CRM, MESSENGER, WEBHOOK)',
    )
    .option('--page <number>', 'Page number', '0')
    .option('--size <number>', 'Page size', '20')
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const format: OutputFormat = globalOpts.format ?? 'json';

        const params: Record<string, string> = { page: opts.page, size: opts.size };
        if (opts.type) params.type = opts.type;

        const data = await apiRequest<PageResponse<IntegrationResponse>>('GET', 'integrations', {
          apiKey: globalOpts.apiKey,
          baseUrl: globalOpts.baseUrl,
          dryRun: globalOpts.dryRun,
          verbose: globalOpts.verbose,
          params,
        });

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
            { truncate: 28 },
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
        const data = await apiRequest<IntegrationResponse>('GET', `integrations/${opts.id}`, {
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

  // ── save ──
  integrations
    .command('save')
    .description('Create or update an integration')
    .requiredOption('--json <body>', 'Request body as JSON string')
    .addHelpText(
      'after',
      dedent`

        Examples:
          # Create
          $ lexq integrations save --json '{
              "type": "WEBHOOK",
              "name": "Order Processing",
              "baseUrl": "https://api.example.com/webhooks/orders",
              "isActive": true
            }'

          # Update (provide id)
          $ lexq integrations save --json '{
              "id": "<existing-id>",
              "type": "WEBHOOK",
              "name": "Order Processing (v2)",
              "baseUrl": "https://api.example.com/v2/webhooks/orders",
              "isActive": true
            }'

        Fields:
          id                 string    Provide to update, omit to create
          type               string    COUPON | POINT | NOTIFICATION | CRM | MESSENGER | WEBHOOK (required)
          name               string    Integration name (required, unique per tenant)
          baseUrl            string    Base URL of the external service (required)
          credential         string    API key or token (optional, write-only)
          additionalConfig   object    Extra config key-value pairs (optional)
          isActive           boolean   Enable/disable  [default: true]

        Use "lexq integrations config-spec" to see required fields per type.
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const body = JSON.parse(opts.json);
        const data = await apiRequest<IntegrationResponse>('POST', 'integrations', {
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

  // ── delete ──
  integrations
    .command('delete')
    .description('Delete an integration')
    .requiredOption('--id <integrationId>', 'Integration ID')
    .option('--force', 'Skip confirmation prompt')
    .addHelpText(
      'after',
      dedent`

        Rules referencing this integration will fail at execution time.
        Use --force to skip confirmation.
      `,
    )
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

        await apiRequest<void>('DELETE', `integrations/${opts.id}`, {
          apiKey: globalOpts.apiKey,
          baseUrl: globalOpts.baseUrl,
          dryRun: globalOpts.dryRun,
          verbose: globalOpts.verbose,
        });
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
    .addHelpText(
      'after',
      dedent`

        Shows required and optional configuration fields for each integration type.

        Example:
          $ lexq integrations config-spec
      `,
    )
    .action(async () => {
      try {
        const globalOpts = program.opts();
        const data = await apiRequest<IntegrationConfigSpecs>('GET', 'integrations/config-spec', {
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
