import { type Command } from 'commander';
import dedent from 'dedent';
import { apiRequest } from '@/lib/api-client';
import { printJson, printTable, printError, type OutputFormat } from '@/lib/output';
import type {
  DomainTemplateSummary,
  DomainTemplatePreviewResponse,
  ApplyDomainTemplateResponse,
} from '@/types/domain-templates';

export function registerDomainTemplateCommands(program: Command): void {
  const templates = program
    .command('domain-templates')
    .description('Browse and apply domain templates')
    .addHelpText(
      'after',
      dedent`

        A domain template is an industry-specific starter pack of fact
        definitions and sample rules. Applying one provisions a ready-to-use
        policy group so you start from a working baseline instead of an
        empty schema.

        Commands:
          list      List available domain templates
          preview   Preview the facts and rules a template provisions
          apply     Apply a template to the current tenant

        Workflow: list → preview → apply
        Currently available: ECOMMERCE  (FINTECH, SAAS — coming soon)
      `,
    );

  // ── list ──
  templates
    .command('list')
    .description('List available domain templates')
    .action(async () => {
      try {
        const globalOpts = program.opts();
        const format: OutputFormat = globalOpts.format ?? 'json';

        const data = await apiRequest<DomainTemplateSummary[]>('GET', 'domain-templates', {
          apiKey: globalOpts.apiKey,
          baseUrl: globalOpts.baseUrl,
          dryRun: globalOpts.dryRun,
          verbose: globalOpts.verbose,
        });

        if (format === 'table') {
          printTable(
            ['Template', 'Name', 'Facts', 'Rules', 'Available'],
            data.map((t) => [
              t.template,
              t.displayName,
              String(t.factCount),
              String(t.ruleCount),
              t.isAvailable ? '✓' : '–',
            ]),
            { truncate: 32 },
          );
        } else {
          printJson(data);
        }
      } catch (error) {
        printError(error);
        process.exit(1);
      }
    });

  // ── preview ──
  templates
    .command('preview')
    .description('Preview what a domain template provisions')
    .requiredOption('--template <key>', 'Domain template key (e.g. ECOMMERCE)')
    .addHelpText(
      'after',
      dedent`

        Read-only dry run — shows the fact definitions and sample rules the
        template will create. Nothing is provisioned.

        Example:
          $ lexq domain-templates preview --template ECOMMERCE
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();
        const data = await apiRequest<DomainTemplatePreviewResponse>(
          'GET',
          `domain-templates/${opts.template}/preview`,
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

  // ── apply ──
  templates
    .command('apply')
    .description('Apply a domain template to the current tenant')
    .requiredOption('--template <key>', 'Domain template key (e.g. ECOMMERCE)')
    .option('--name <n>', 'Custom name for the policy group that gets created')
    .option('--force', 'Skip confirmation prompt')
    .addHelpText(
      'after',
      dedent`

        Creates the template's fact definitions and a new DRAFT policy group
        populated with its sample rules. Existing facts are skipped — apply is
        additive and never overwrites your schema.

        Run "preview" first to review what will be created.

        Example:
          $ lexq domain-templates apply --template ECOMMERCE
          $ lexq domain-templates apply --template ECOMMERCE --name "My Store Policy"
      `,
    )
    .action(async (opts) => {
      try {
        const globalOpts = program.opts();

        if (!opts.force) {
          const { createInterface } = await import('node:readline/promises');
          const rl = createInterface({ input: process.stdin, output: process.stdout });
          const answer = await rl.question(
            `Apply domain template ${opts.template} to the current tenant? [y/N] `,
          );
          rl.close();
          if (answer.toLowerCase() !== 'y') {
            console.log('Canceled.');
            return;
          }
        }

        const body: Record<string, unknown> = {};
        if (opts.name) body.customName = opts.name;

        const data = await apiRequest<ApplyDomainTemplateResponse>(
          'POST',
          `domain-templates/${opts.template}/apply`,
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
}
