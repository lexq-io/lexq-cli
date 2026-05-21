import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CallApi } from './_shared';

export function registerDomainTemplateTools(server: McpServer, callApi: CallApi): void {
  server.registerTool(
    'lexq_domain_templates_list',
    {
      title: 'List Domain Templates',
      description:
        'List all domain templates. A domain template is a curated, industry-specific starter pack of fact definitions and sample rules (e.g. ECOMMERCE). Each entry reports its key, status (ACTIVE or COMING_SOON), and a summary of what it provisions. Call this before preview or apply to discover which templates can currently be applied.',
      inputSchema: {},
    },
    async () => callApi('GET', 'domain-templates'),
  );

  server.registerTool(
    'lexq_domain_templates_preview',
    {
      title: 'Preview Domain Template',
      description:
        'Preview exactly what a domain template will provision before applying it: the fact definitions it registers, the sample rules it creates, and an apply plan. This is a read-only dry run — nothing is created. Only ACTIVE templates can be previewed.',
      inputSchema: {
        template: z
          .string()
          .describe(
            'Domain template key (e.g. ECOMMERCE). Use lexq_domain_templates_list to see available keys — currently only ECOMMERCE is ACTIVE.',
          ),
      },
    },
    async ({ template }) => callApi('GET', `domain-templates/${template}/preview`),
  );

  server.registerTool(
    'lexq_domain_templates_apply',
    {
      title: 'Apply Domain Template',
      description:
        "Apply a domain template to the current tenant. Creates the template's fact definitions and a new policy group pre-populated with its sample rules as a DRAFT version. Existing facts are skipped — apply is additive and never overwrites existing schema. Run lexq_domain_templates_preview first to review what will be created. Only ACTIVE templates can be applied.",
      inputSchema: {
        template: z.string().describe('Domain template key to apply (e.g. ECOMMERCE).'),
        customName: z
          .string()
          .optional()
          .describe(
            "Optional custom name for the policy group that gets created. If omitted, the template's default name is used.",
          ),
      },
    },
    async ({ template, customName }) => {
      const body: Record<string, unknown> = {};
      if (customName !== undefined) body.customName = customName;
      return callApi('POST', `domain-templates/${template}/apply`, { body });
    },
  );
}
