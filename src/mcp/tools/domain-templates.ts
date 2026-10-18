import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { CallApi } from './_shared';

export function registerDomainTemplateTools(server: McpServer, callApi: CallApi): void {
  server.registerTool(
    'lexq_domain_templates_list',
    {
      title: 'List Domain Templates',
      annotations: { readOnlyHint: true },
      description:
        'List all domain templates. A domain template is a starter pack of fact definitions and sample rules for a common decision, such as checkout pricing (ECOMMERCE) or transfer approval (FINTECH). Each entry reports its key, whether it can be applied (isAvailable), and how many facts and sample rules it provisions. Call this before preview or apply to see which templates exist.',
      inputSchema: z.object({}),
    },
    async () => callApi('GET', 'domain-templates'),
  );

  server.registerTool(
    'lexq_domain_templates_preview',
    {
      title: 'Preview Domain Template',
      annotations: { readOnlyHint: true },
      description:
        'Preview exactly what a domain template will provision before applying it: the fact definitions it registers (an input with a value domain carries its allowed values or range), the sample rules it creates with a description of each, and an apply plan. This is a read-only dry run; nothing is created. factConflicts lists keys this tenant already has with a different type, or with different allowed values or a different range on an input fact. While it is not empty, apply fails with P-061 and creates nothing: delete those facts or change them to match the template, then apply. plan is null for a template that cannot be applied yet.',
      inputSchema: z.object({
        template: z
          .string()
          .describe(
            'Domain template key (e.g. ECOMMERCE). Use lexq_domain_templates_list to see the keys.',
          ),
      }),
    },
    async ({ template }) => callApi('GET', `domain-templates/${template}/preview`),
  );

  server.registerTool(
    'lexq_domain_templates_apply',
    {
      title: 'Apply Domain Template',
      annotations: { readOnlyHint: false, destructiveHint: false },
      description:
        "Apply a domain template to the current tenant. Creates the template's fact definitions and a new policy group pre-populated with its sample rules as a DRAFT version. Apply never overwrites existing schema: a key that already exists with the same definition is kept as it is. Run lexq_domain_templates_preview first. If its factConflicts is not empty, apply fails with P-061 and creates nothing until those facts are deleted or changed to match the template. A template whose isAvailable is false cannot be applied.",
      inputSchema: z.object({
        template: z.string().describe('Domain template key to apply (e.g. ECOMMERCE).'),
        customName: z
          .string()
          .optional()
          .describe(
            "Optional custom name for the policy group that gets created. If omitted, the template's default name is used.",
          ),
      }),
    },
    async ({ template, customName }) => {
      const body: Record<string, unknown> = {};
      if (customName !== undefined) body.customName = customName;
      return callApi('POST', `domain-templates/${template}/apply`, { body });
    },
  );
}
