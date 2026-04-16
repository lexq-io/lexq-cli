import { type Command } from 'commander';
import dedent from 'dedent';
import { apiRequest } from '@/lib/api-client';
import type { PageResponse } from '@/types/api';
import { printJson, printTable, printError, type OutputFormat } from '@/lib/output';
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
    .option('--page <number>', 'Page number', '0')
    .option('--size <number>', 'Page size', '20')
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const format: OutputFormat = globalOpts.format ?? 'json';

        const data = await apiRequest<PageResponse<PolicyRuleSummary>>(
          'GET',
          `policy-groups/${opts.groupId}/versions/${opts.versionId}/rules`,
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
            ['ID', 'Name', 'Priority', 'Conditions', 'Actions', 'Enabled'],
            data.content.map((r) => [
              r.id,
              r.name,
              String(r.priority),
              String(r.totalConditionCount),
              String(r.totalActionCount),
              r.isEnabled ? '✓' : '✗',
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
              "priority": 0,
              "condition": {
                "type": "SINGLE",
                "field": "customer_tier",
                "operator": "EQUALS",
                "value": "VIP",
                "valueType": "STRING"
              },
              "actions": [
                { "type": "DISCOUNT", "parameters": { "method": "PERCENTAGE", "rate": 20, "refVar": "payment_amount" } }
              ]
            }'

        Condition Operators:
          EQUALS, NOT_EQUALS, GREATER_THAN, GREATER_THAN_OR_EQUAL,
          LESS_THAN, LESS_THAN_OR_EQUAL, CONTAINS, IN, NOT_IN

        Action Types:
          DISCOUNT, POINT, COUPON_ISSUE, BLOCK, NOTIFICATION, WEBHOOK, SET_FACT, ADD_TAG

        Value Types: STRING, NUMBER, BOOLEAN, LIST_STRING, LIST_NUMBER

        Mutex (optional — rule-level conflict resolution):
          mutexGroup       string    Logical grouping key (e.g., "best-discount")
          mutexMode        string    NONE | EXCLUSIVE  [default: NONE]
          mutexStrategy    string    FIRST_MATCH | HIGHEST_PRIORITY | MAX_BENEFIT
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const body = JSON.parse(opts.json) as CreateRuleRequest;
        const data = await apiRequest<PolicyRuleDetail>(
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
                { "type": "DISCOUNT", "parameters": { "method": "PERCENTAGE", "rate": 25, "refVar": "payment_amount" } }
              ]
            }'
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const body = JSON.parse(opts.json) as UpdateRuleRequest;
        const data = await apiRequest<PolicyRuleDetail>(
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
            console.log('Cancelled.');
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

        Assigns priority 0, 1, 2, ... to rules in the order given.

        Example:
          $ lexq rules reorder --group-id <gid> --version-id <vid> --rule-ids "id3,id1,id2"

          Result: id3 → priority 0, id1 → priority 1, id2 → priority 2
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const ruleIds = (opts.ruleIds as string).split(',').map((id: string) => id.trim());

        const body: ReorderRulesRequest = {
          rules: ruleIds.map((ruleId, index) => ({
            ruleId,
            priority: index,
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
