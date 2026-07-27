import { type Command } from 'commander';
import dedent from 'dedent';
import { apiRequest, apiRequestWithMeta } from '@/lib/api-client';
import {
  printJson,
  printTable,
  printError,
  printUnregisteredFactsWarning,
  type OutputFormat,
} from '@/lib/output';
import type {
  PolicyRuleSummary,
  PolicyRuleDetail,
  CreateRuleRequest,
  UpdateRuleRequest,
  ReorderRulesRequest,
} from '@/types/rules';

export function registerRuleCommands(program: Command): void {
  const rules = program
    .command('rules')
    .description('Manage policy rules')
    .addHelpText(
      'after',
      dedent`

        Rules define condition → action pairs within a version.
        They are evaluated in priority order (lower number = higher priority).

        Commands:
          list      List rules in a version
          get       Get rule detail
          create    Add a new rule to a DRAFT version
          update    Modify a rule in a DRAFT version
          delete    Remove a rule from a DRAFT version
          reorder   Change rule priorities (drag & drop equivalent)
          toggle    Enable or disable a rule

        Only DRAFT versions allow rule modifications.
      `,
    );

  // ── list ──
  rules
    .command('list')
    .description('List rules for a policy version')
    .requiredOption('--group-id <groupId>', 'Policy group ID')
    .requiredOption('--version-id <versionId>', 'Policy version ID')
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const format: OutputFormat = globalOpts.format ?? 'json';

        const data = await apiRequest<PolicyRuleSummary[]>(
          'GET',
          `policy-groups/${opts.groupId}/versions/${opts.versionId}/rules`,
          {
            apiKey: globalOpts.apiKey,
            baseUrl: globalOpts.baseUrl,
            dryRun: globalOpts.dryRun,
            verbose: globalOpts.verbose,
          },
        );

        if (format === 'table') {
          printTable(
            ['ID', 'Name', 'Priority', 'Conditions', 'Actions', 'Enabled'],
            data.map((r) => [
              r.id,
              r.name,
              String(r.priority),
              String(r.totalConditionCount),
              String(r.totalActionCount),
              r.isEnabled ? '✓' : '✗',
            ]),
            { truncate: 24 },
          );
          console.log(`\n${data.length} total`);
        } else {
          printJson(data);
        }
      } catch (error) {
        printError(error);
        process.exit(1);
      }
    });

  // ── get ──
  rules
    .command('get')
    .description('Get a rule by ID')
    .requiredOption('--group-id <groupId>', 'Policy group ID')
    .requiredOption('--version-id <versionId>', 'Policy version ID')
    .requiredOption('--id <ruleId>', 'Rule ID')
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const data = await apiRequest<PolicyRuleDetail>(
          'GET',
          `policy-groups/${opts.groupId}/versions/${opts.versionId}/rules/${opts.id}`,
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

  // ── create ──
  rules
    .command('create')
    .description('Create a new rule')
    .requiredOption('--group-id <groupId>', 'Policy group ID')
    .requiredOption('--version-id <versionId>', 'Policy version ID')
    .requiredOption('--json <body>', 'Request body as JSON string')
    .addHelpText(
      'after',
      dedent`

        Example:
          $ lexq rules create --group-id <gid> --version-id <vid> --json '{
              "name": "VIP 20% Discount",
              "condition": {
                "type": "SINGLE",
                "field": "customer_tier",
                "operator": "EQUALS",
                "value": "VIP",
                "valueType": "STRING"
              },
              "actions": [
                { "type": "MUTATE_FACT", "parameters": { "refVar": "payment_amount", "operator": "SUB", "method": "PERCENTAGE", "rate": 20 } }
              ]
            }'

        Condition Operators (by fact type):
          STRING        EQUALS, NOT_EQUALS, CONTAINS, IN, NOT_IN
          NUMBER        EQUALS, NOT_EQUALS, GREATER_THAN, GREATER_THAN_OR_EQUAL,
                        LESS_THAN, LESS_THAN_OR_EQUAL, IN, NOT_IN
          BOOLEAN       EQUALS, NOT_EQUALS
          LIST_STRING   HAS_ANY, HAS_ALL, HAS_NONE
          LIST_NUMBER   HAS_ANY, HAS_ALL, HAS_NONE

          Using an operator outside its fact type is rejected by the server.

        List-typed facts (HAS_*) — the value is always an array:
          HAS_ANY    fact has at least one of the given values
          HAS_ALL    fact has all of the given values
          HAS_NONE   fact has none of the given values

          Example:
            { "type": "SINGLE", "field": "user_tags", "operator": "HAS_ANY",
              "value": ["VIP", "GOLD"], "valueType": "LIST_STRING" }

          CONTAINS is substring match on STRING facts, not list membership.
          IN is the mirror of HAS_*: scalar fact, list value.

        Action Types:
          MUTATE_FACT, INCREMENT_FACT, EMIT_EVENT, BLOCK, EMIT_NOTIFICATION, EMIT_WEBHOOK, SET_FACT, ADD_TAG

        Value Types: STRING, NUMBER, BOOLEAN, LIST_STRING, LIST_NUMBER

        Mutex (optional — rule-level conflict resolution):
          mutexGroup       string    Logical grouping key (e.g., "best-discount")
          mutexMode        string    NONE | EXCLUSIVE | MAX_N  [default: NONE]
          mutexStrategy    string    FIRST_MATCH | HIGHEST_PRIORITY | MAX_BENEFIT
          mutexLimit       number    Max rules to fire in MAX_N mode (required when MAX_N)

        priority is auto-assigned (appended last). Use 'lexq rules reorder' to change order.
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const body = JSON.parse(opts.json) as CreateRuleRequest;
        const { data, meta } = await apiRequestWithMeta<PolicyRuleDetail>(
          'POST',
          `policy-groups/${opts.groupId}/versions/${opts.versionId}/rules`,
          {
            apiKey: globalOpts.apiKey,
            baseUrl: globalOpts.baseUrl,
            dryRun: globalOpts.dryRun,
            verbose: globalOpts.verbose,
            body,
          },
        );
        printJson(data);
        printUnregisteredFactsWarning(meta?.unregisteredFacts ?? []);
      } catch (error) {
        printError(error);
        process.exit(1);
      }
    });

  // ── update ──
  rules
    .command('update')
    .description('Update a rule')
    .requiredOption('--group-id <groupId>', 'Policy group ID')
    .requiredOption('--version-id <versionId>', 'Policy version ID')
    .requiredOption('--id <ruleId>', 'Rule ID')
    .requiredOption('--json <body>', 'Request body as JSON string')
    .addHelpText(
      'after',
      dedent`

        Same fields as create. Only DRAFT versions can be modified.

        Example:
          $ lexq rules update --group-id <gid> --version-id <vid> --id <rid> --json '{
              "name": "VIP 25% Discount",
              "actions": [
                { "type": "MUTATE_FACT", "parameters": { "refVar": "payment_amount", "operator": "SUB", "method": "PERCENTAGE", "rate": 25 } }
              ]
            }'
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const body = JSON.parse(opts.json) as UpdateRuleRequest;
        const { data, meta } = await apiRequestWithMeta<PolicyRuleDetail>(
          'PUT',
          `policy-groups/${opts.groupId}/versions/${opts.versionId}/rules/${opts.id}`,
          {
            apiKey: globalOpts.apiKey,
            baseUrl: globalOpts.baseUrl,
            dryRun: globalOpts.dryRun,
            verbose: globalOpts.verbose,
            body,
          },
        );
        printJson(data);
        printUnregisteredFactsWarning(meta?.unregisteredFacts ?? []);
      } catch (error) {
        printError(error);
        process.exit(1);
      }
    });

  // ── delete ──
  rules
    .command('delete')
    .description('Delete a rule')
    .requiredOption('--group-id <groupId>', 'Policy group ID')
    .requiredOption('--version-id <versionId>', 'Policy version ID')
    .requiredOption('--id <ruleId>', 'Rule ID')
    .option('--force', 'Skip confirmation prompt')
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();

        if (!opts.force) {
          const { createInterface } = await import('node:readline/promises');
          const rl = createInterface({ input: process.stdin, output: process.stdout });
          const answer = await rl.question(`Delete rule ${opts.id}? [y/N] `);
          rl.close();
          if (answer.toLowerCase() !== 'y') {
            console.log('Canceled.');
            return;
          }
        }

        await apiRequest<void>(
          'DELETE',
          `policy-groups/${opts.groupId}/versions/${opts.versionId}/rules/${opts.id}`,
          {
            apiKey: globalOpts.apiKey,
            baseUrl: globalOpts.baseUrl,
            dryRun: globalOpts.dryRun,
            verbose: globalOpts.verbose,
          },
        );
        console.log(`✓ Rule ${opts.id} deleted.`);
      } catch (error) {
        printError(error);
        process.exit(1);
      }
    });

  // ── reorder ──
  rules
    .command('reorder')
    .description('Reorder rules by priority (drag & drop equivalent)')
    .requiredOption('--group-id <groupId>', 'Policy group ID')
    .requiredOption('--version-id <versionId>', 'Policy version ID')
    .requiredOption('--rule-ids <ids>', 'Comma-separated rule IDs in desired order')
    .addHelpText(
      'after',
      dedent`

        Assigns priority 1, 2, 3, ... to rules in the order given (1-based, 1...N continuous).

        Example:
          $ lexq rules reorder --group-id <gid> --version-id <vid> --rule-ids "id3,id1,id2"

          Result: id3 → priority 1, id1 → priority 2, id2 → priority 3
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const ruleIds = (opts.ruleIds as string).split(',').map((id: string) => id.trim());

        const body: ReorderRulesRequest = {
          rules: ruleIds.map((ruleId, index) => ({
            ruleId,
            priority: index + 1,
          })),
        };

        await apiRequest<void>(
          'PATCH',
          `policy-groups/${opts.groupId}/versions/${opts.versionId}/rules/reorder`,
          {
            apiKey: globalOpts.apiKey,
            baseUrl: globalOpts.baseUrl,
            dryRun: globalOpts.dryRun,
            verbose: globalOpts.verbose,
            body,
          },
        );
        console.log(`✓ ${ruleIds.length} rules reordered.`);
      } catch (error) {
        printError(error);
        process.exit(1);
      }
    });

  // ── toggle ──
  rules
    .command('toggle')
    .description('Enable or disable a rule')
    .requiredOption('--group-id <groupId>', 'Policy group ID')
    .requiredOption('--version-id <versionId>', 'Policy version ID')
    .requiredOption('--id <ruleId>', 'Rule ID')
    .requiredOption('--enabled <boolean>', 'true or false')
    .addHelpText(
      'after',
      dedent`

        Disabled rules are skipped during execution without deleting them.

        Example:
          $ lexq rules toggle --group-id <gid> --version-id <vid> --id <rid> --enabled false
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const isEnabled = opts.enabled === 'true';

        await apiRequest<void>(
          'PATCH',
          `policy-groups/${opts.groupId}/versions/${opts.versionId}/rules/${opts.id}/enabled`,
          {
            apiKey: globalOpts.apiKey,
            baseUrl: globalOpts.baseUrl,
            dryRun: globalOpts.dryRun,
            verbose: globalOpts.verbose,
            body: { isEnabled },
          },
        );
        console.log(`✓ Rule ${opts.id} ${isEnabled ? 'enabled' : 'disabled'}.`);
      } catch (error) {
        printError(error);
        process.exit(1);
      }
    });
}
