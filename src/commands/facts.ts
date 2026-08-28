import { type Command } from 'commander';
import dedent from 'dedent';
import { apiRequest } from '@/lib/api-client';
import { EXPORT_FORMATS, parseFormat, runExport } from '@/lib/export';
import type { PageResponse, UnregisteredFact } from '@/types/api';
import { printJson, printTable, printError, type OutputFormat } from '@/lib/output';
import type { CreateFactRequest, UpdateFactRequest, FactSchemaResponse } from '@/types/facts';

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
          unregistered     List facts referenced by a version but not yet defined
          create           Register a new fact
          update           Update fact metadata
          delete           Remove a fact definition
          action-metadata  Show action runtime fact metadata

        System facts (userId, userTags) are auto-created.
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
            ['ID', 'Key', 'Name', 'Type', 'System', 'Required', 'PII'],
            data.content.map((f) => [
              f.id,
              f.key,
              f.name,
              f.type,
              f.isSystem ? '✓' : '–',
              f.isRequired ? '✓' : '–',
              f.isPii ? '✓' : '–',
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

  // ── unregistered ──
  facts
    .command('unregistered')
    .description('List facts referenced by a version but not yet defined')
    .requiredOption('--group-id <groupId>', 'Policy group ID')
    .requiredOption('--version-id <versionId>', 'Policy version ID')
    .addHelpText(
      'after',
      dedent`

        Facts used in a version's rules that have no definition yet (read-only).
        Does not block publish/deploy — register them to enable validation.

        Example:
          $ lexq facts unregistered --group-id <gid> --version-id <vid> --format table
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const format: OutputFormat = globalOpts.format ?? 'json';

        const data = await apiRequest<UnregisteredFact[]>(
          'GET',
          `policy-groups/${opts.groupId}/versions/${opts.versionId}/unregistered-facts`,
          {
            apiKey: globalOpts.apiKey,
            baseUrl: globalOpts.baseUrl,
            dryRun: globalOpts.dryRun,
            verbose: globalOpts.verbose,
          },
        );

        if (format === 'table') {
          printTable(
            ['Key', 'Type', 'Suggested Name', 'Conflict', 'Sources'],
            data.map((f) => [
              f.key,
              f.inferredType ?? f.candidateTypes?.join('|') ?? '?',
              f.suggestedName,
              f.conflict ? '✓' : '–',
              f.sources.map((s) => `${s.kind}:${s.field}`).join(', '),
            ]),
            { truncate: 28 },
          );
          console.log(`\n${data.length} unregistered`);
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
    .option('--key <key>', 'Fact key (letters, numbers, underscores)')
    .option('--name <n>', 'Display name')
    .option('--type <type>', 'Value type: STRING, NUMBER, BOOLEAN, LIST_STRING, LIST_NUMBER')
    .option('--description <desc>', 'Description')
    .option('--required', 'Mark as required', false)
    .option('--pii', 'Mark as PII — value is masked on every read surface', false)
    .option('--json <body>', 'Full request body as JSON (overrides other options)')
    .addHelpText(
      'after',
      dedent`

        Examples:
          $ lexq facts create --key customerTier --name "Customer Tier" --type STRING
          $ lexq facts create --key orderTotal --name "Order Total" --type NUMBER --required

          $ lexq facts create --json '{
              "key": "userRegion",
              "name": "User Region",
              "type": "STRING",
              "description": "ISO country code",
              "isRequired": false
            }'

        Value Types: STRING, NUMBER, BOOLEAN, LIST_STRING, LIST_NUMBER
        Key Format:  starts with a letter, then letters, numbers, and underscores.
                     Casing is yours to choose (e.g., paymentAmount, payment_amount)
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const body: CreateFactRequest = opts.json
          ? (JSON.parse(opts.json) as CreateFactRequest)
          : buildCreateBody(opts);

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
    .option('--pii', 'Mark as PII (enables masking)')
    .option('--no-pii', 'Unmark as PII (disables masking — value becomes visible)')
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
        const body: UpdateFactRequest = opts.json
          ? (JSON.parse(opts.json) as UpdateFactRequest)
          : buildUpdateBody(opts);

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
            console.log('Canceled.');
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
  // ── export ──
  facts
    .command('export')
    .description('Export the fact catalog')
    .option('--as <fmt>', `Exported file format: ${EXPORT_FORMATS.join(' or ')}`, 'csv')
    .option('--keyword <keyword>', 'Filter by key or name')
    .option('--output <path>', 'Output file path')
    .addHelpText(
      'after',
      dedent`

        The two formats carry different things. CSV is the catalog as it stands, system
        facts included, for reading in a spreadsheet. JSON matches the shape that
        batch create accepts, so it can be fed straight back in — which is why it leaves
        out the fields that endpoint does not take.

        Examples:
          $ lexq facts export --output facts.csv
          $ lexq facts export --as json --output facts.json
          $ lexq facts export --keyword user --as json
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();

        await runExport('schema/facts/export', parseFormat(opts.as), {
          apiKey: globalOpts.apiKey,
          baseUrl: globalOpts.baseUrl,
          dryRun: globalOpts.dryRun,
          verbose: globalOpts.verbose,
          output: opts.output,
          params: opts.keyword ? { keyword: opts.keyword as string } : undefined,
        });
      } catch (error) {
        printError(error);
        process.exit(1);
      }
    });

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

function buildCreateBody(opts: Record<string, string | boolean | undefined>): CreateFactRequest {
  if (!opts.key || !opts.name || !opts.type)
    throw new Error('--key, --name, and --type are required (or use --json).');
  const body: CreateFactRequest = {
    key: opts.key as string,
    name: opts.name as string,
    type: opts.type as CreateFactRequest['type'],
    isRequired: opts.required === true,
    isPii: opts.pii === true,
  };
  if (opts.description) body.description = opts.description as string;
  return body;
}

function buildUpdateBody(opts: Record<string, string | boolean | undefined>): UpdateFactRequest {
  const body: UpdateFactRequest = {};
  if (opts.name) body.name = opts.name as string;
  if (opts.description !== undefined) body.description = opts.description as string;
  if (typeof opts.required === 'boolean') body.isRequired = opts.required;
  if (typeof opts.isPii === 'boolean') body.isPii = opts.isPii;
  return body;
}
