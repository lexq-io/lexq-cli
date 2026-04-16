import { type Command } from 'commander';
import dedent from 'dedent';
import { apiRequest } from '@/lib/api-client';
import type { PageResponse } from '@/types/api';
import { printJson, printTable, printError, type OutputFormat } from '@/lib/output';
import type { FactSchemaResponse } from '@/types/facts';

export function registerFactCommands(program: Command): void {
  const facts = program
    .command('facts')
    .description('Manage fact definitions (schema)')
    .addHelpText(
      'after',
      dedent`

        Facts are input variables passed during policy execution.
        Define them here so rules can reference them in conditions and actions.

        Commands:
          list             List all fact definitions
          create           Register a new fact
          update           Update fact metadata
          delete           Remove a fact definition
          action-metadata  Show action runtime fact metadata

        System facts (payment_amount, user_id, etc.) are auto-created and immutable.
      `,
    );

  // ── list ──
  facts
    .command('list')
    .description('List fact definitions')
    .option('--keyword <keyword>', 'Filter by keyword')
    .option('--page <number>', 'Page number', '0')
    .option('--size <number>', 'Page size', '20')
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const format: OutputFormat = globalOpts.format ?? 'json';

        const params: Record<string, string> = { page: opts.page, size: opts.size };
        if (opts.keyword) params.keyword = opts.keyword;

        const data = await apiRequest<PageResponse<FactSchemaResponse>>('GET', 'schema/facts', {
          apiKey: globalOpts.apiKey,
          baseUrl: globalOpts.baseUrl,
          dryRun: globalOpts.dryRun,
          verbose: globalOpts.verbose,
          params,
        });

        if (format === 'table') {
          printTable(
            ['ID', 'Key', 'Name', 'Type', 'System', 'Required'],
            data.content.map((f) => [
              f.id,
              f.key,
              f.name,
              f.type,
              f.isSystem ? '✓' : '–',
              f.isRequired ? '✓' : '–',
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

  // ── create ──
  facts
    .command('create')
    .description('Create a new fact definition')
    .option('--key <key>', 'Fact key (lowercase, underscores)')
    .option('--name <n>', 'Display name')
    .option('--type <type>', 'Value type: STRING, NUMBER, BOOLEAN, LIST_STRING, LIST_NUMBER')
    .option('--description <desc>', 'Description')
    .option('--required', 'Mark as required', false)
    .option('--json <body>', 'Full request body as JSON (overrides other options)')
    .addHelpText(
      'after',
      dedent`

        Examples:
          $ lexq facts create --key customer_tier --name "Customer Tier" --type STRING
          $ lexq facts create --key order_total --name "Order Total" --type NUMBER --required

          $ lexq facts create --json '{
              "key": "user_region",
              "name": "User Region",
              "type": "STRING",
              "description": "ISO country code",
              "isRequired": false
            }'

        Value Types: STRING, NUMBER, BOOLEAN, LIST_STRING, LIST_NUMBER
        Key Format:  lowercase letters, numbers, underscores only (e.g., payment_amount)
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const body = opts.json ? JSON.parse(opts.json) : buildCreateBody(opts);

        const data = await apiRequest<FactSchemaResponse>('POST', 'schema/facts', {
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

  // ── update ──
  facts
    .command('update')
    .description('Update a fact definition')
    .requiredOption('--id <factId>', 'Fact definition ID')
    .option('--name <n>', 'Display name')
    .option('--description <desc>', 'Description')
    .option('--required', 'Mark as required')
    .option('--no-required', 'Mark as not required')
    .option('--json <body>', 'Full request body as JSON (overrides other options)')
    .addHelpText(
      'after',
      dedent`

        System facts cannot be modified. Only display name, description, and required flag can be changed.

        Example:
          $ lexq facts update --id <factId> --name "Updated Name" --required
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const body = opts.json ? JSON.parse(opts.json) : buildUpdateBody(opts);

        const data = await apiRequest<FactSchemaResponse>('PUT', `schema/facts/${opts.id}`, {
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
  facts
    .command('delete')
    .description('Delete a fact definition')
    .requiredOption('--id <factId>', 'Fact definition ID')
    .option('--force', 'Skip confirmation prompt')
    .addHelpText(
      'after',
      dedent`

        System facts cannot be deleted. Use --force to skip the confirmation prompt.
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();

        if (!opts.force) {
          const { createInterface } = await import('node:readline/promises');
          const rl = createInterface({ input: process.stdin, output: process.stdout });
          const answer = await rl.question(`Delete fact ${opts.id}? [y/N] `);
          rl.close();
          if (answer.toLowerCase() !== 'y') {
            console.log('Cancelled.');
            return;
          }
        }

        await apiRequest<void>('DELETE', `schema/facts/${opts.id}`, {
          apiKey: globalOpts.apiKey,
          baseUrl: globalOpts.baseUrl,
          dryRun: globalOpts.dryRun,
          verbose: globalOpts.verbose,
        });
        console.log(`✓ Fact ${opts.id} deleted.`);
      } catch (error) {
        printError(error);
        process.exit(1);
      }
    });

  // ── action-metadata ──
  facts
    .command('action-metadata')
    .description('Get action runtime fact metadata')
    .addHelpText(
      'after',
      dedent`

        Shows which facts are automatically created by each action type at runtime.
        Useful for understanding what output variables are available after rule execution.
      `,
    )
    .action(async () => {
      try {
        const globalOpts = program.opts();
        const data = await apiRequest<unknown>('GET', 'schema/action-metadata', {
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

function buildCreateBody(
  opts: Record<string, string | boolean | undefined>,
): Record<string, unknown> {
  if (!opts.key || !opts.name || !opts.type)
    throw new Error('--key, --name, and --type are required (or use --json).');
  const body: Record<string, unknown> = {
    key: opts.key,
    name: opts.name,
    type: opts.type,
    isRequired: opts.required === true,
  };
  if (opts.description) body.description = opts.description;
  return body;
}

function buildUpdateBody(
  opts: Record<string, string | boolean | undefined>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (opts.name) body.name = opts.name;
  if (opts.description !== undefined) body.description = opts.description;
  if (typeof opts.required === 'boolean') body.isRequired = opts.required;
  return body;
}
