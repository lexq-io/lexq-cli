import { type Command } from 'commander';
import dedent from 'dedent';
import { apiRequest } from '@/lib/api-client';
import type { PageResponse } from '@/types/api';
import { printJson, printTable, printError, type OutputFormat } from '@/lib/output';
import type {
  WebhookSubscriptionResponse,
  WebhookSubscriptionTestResponse,
} from '@/types/webhook-subscriptions';

export function registerWebhookSubscriptionCommands(program: Command): void {
  const webhooks = program
    .command('webhook-subscriptions')
    .description('Manage platform event webhook subscriptions')
    .addHelpText(
      'after',
      dedent`

        Receive notifications when deployment lifecycle events occur
        (publish, deploy, rollback, undeploy).

        Commands:
          list      List all webhook subscriptions
          get       Get subscription detail
          save      Create or update a subscription
          delete    Delete a subscription
          test      Send a test event to verify connectivity

        This is separate from Integrations (rule action webhooks).
        Webhook subscriptions are for platform-level event notifications.
      `,
    );

  // ── list ──
  webhooks
    .command('list')
    .description('List webhook subscriptions')
    .option('--page <number>', 'Page number', '0')
    .option('--size <number>', 'Page size', '20')
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const format: OutputFormat = globalOpts.format ?? 'json';

        const data = await apiRequest<PageResponse<WebhookSubscriptionResponse>>(
          'GET',
          'webhook-subscriptions',
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
            ['ID', 'Name', 'Events', 'Format', 'Active'],
            data.content.map((s) => [
              s.id.substring(0, 8),
              s.name,
              s.subscribedEvents.join(', '),
              s.payloadFormat,
              s.isActive ? '✓' : '✗',
            ]),
            { truncate: 32 },
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
  webhooks
    .command('get')
    .description('Get webhook subscription detail')
    .requiredOption('--id <subscriptionId>', 'Subscription ID')
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const data = await apiRequest<WebhookSubscriptionResponse>(
          'GET',
          `webhook-subscriptions/${opts.id}`,
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

  // ── save ──
  webhooks
    .command('save')
    .description('Create or update a webhook subscription')
    .requiredOption('--json <body>', 'Request body as JSON string')
    .addHelpText(
      'after',
      dedent`

        Examples:
          # Create (Slack format)
          $ lexq webhook-subscriptions save --json '{
              "name": "Deploy Alert",
              "webhookUrl": "https://hooks.slack.com/services/...",
              "subscribedEvents": ["DEPLOYED", "ROLLED_BACK"],
              "payloadFormat": "SLACK"
            }'

          # Update (provide id)
          $ lexq webhook-subscriptions save --json '{
              "id": "<existing-id>",
              "name": "Deploy Alert",
              "webhookUrl": "https://hooks.slack.com/services/...",
              "subscribedEvents": ["VERSION_PUBLISHED", "DEPLOYED", "ROLLED_BACK", "UNDEPLOYED"],
              "payloadFormat": "SLACK",
              "secret": "my-hmac-secret"
            }'

        Fields:
          name                string      Subscription name (required, unique per tenant)
          webhookUrl          string      Webhook endpoint URL (required)
          subscribedEvents    string[]    VERSION_PUBLISHED, DEPLOYED, ROLLED_BACK, UNDEPLOYED
          payloadFormat       string      GENERIC (full JSON) or SLACK ({"text":"..."})  [default: GENERIC]
          secret              string      HMAC-SHA256 signing secret (optional)
          isActive            boolean     Enable/disable (optional)  [default: true]
          id                  string      Provide to update, omit to create

        When secret is set, an X-LexQ-Signature header (sha256=hex) is sent for verification.
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const body = JSON.parse(opts.json) as Record<string, unknown>;
        const data = await apiRequest<WebhookSubscriptionResponse>(
          'POST',
          'webhook-subscriptions',
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

  // ── delete ──
  webhooks
    .command('delete')
    .description('Delete a webhook subscription')
    .requiredOption('--id <subscriptionId>', 'Subscription ID')
    .option('--force', 'Skip confirmation prompt')
    .addHelpText(
      'after',
      dedent`

        Use --force to skip the confirmation prompt.

        Example:
          $ lexq webhook-subscriptions delete --id <id> --force
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();

        if (!opts.force) {
          const { createInterface } = await import('node:readline/promises');
          const rl = createInterface({ input: process.stdin, output: process.stdout });
          const answer = await rl.question(`Delete webhook subscription ${opts.id}? [y/N] `);
          rl.close();
          if (answer.toLowerCase() !== 'y') {
            console.log('Cancelled.');
            return;
          }
        }

        await apiRequest<void>('DELETE', `webhook-subscriptions/${opts.id}`, {
          apiKey: globalOpts.apiKey,
          baseUrl: globalOpts.baseUrl,
          dryRun: globalOpts.dryRun,
          verbose: globalOpts.verbose,
        });
        console.log(`✓ Webhook subscription ${opts.id} deleted.`);
      } catch (error) {
        printError(error);
        process.exit(1);
      }
    });

  // ── test ──
  webhooks
    .command('test')
    .description('Send a test event to verify webhook connectivity')
    .requiredOption('--id <subscriptionId>', 'Subscription ID')
    .addHelpText(
      'after',
      dedent`

        Sends a test event to the webhook URL and reports the HTTP status code.
        Does not record failures in the failure log.

        The response includes:
          statusCode     HTTP status code returned by the webhook endpoint
          success        true if 2xx response received
          message        human-readable status message

        Example:
          $ lexq webhook-subscriptions test --id <id>
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const data = await apiRequest<WebhookSubscriptionTestResponse>(
          'POST',
          `webhook-subscriptions/${opts.id}/test`,
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
}
