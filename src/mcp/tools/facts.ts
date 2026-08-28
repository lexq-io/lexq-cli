import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CallApi } from './_shared';
import { paginationParams } from './_shared';
import { FACT_KEY_PATTERN } from '@/types/facts';
import { ValueType } from '@/types/enums';
import { EXPORT_FORMATS } from '@/lib/export';

/** Generated from the engine contract manifest. A literal here would drift. */
const VALUE_TYPES = ValueType;

export function registerFactTools(server: McpServer, callApi: CallApi): void {
  server.registerTool(
    'lexq_facts_list',
    {
      title: 'List Fact Definitions',
      description:
        'List all fact definitions (input variable schema). Shows key, type, required, and PII status. Always check this before creating rules.',
      inputSchema: {
        page: z.number().int().min(0).default(0).describe('Page number'),
        size: z.number().int().min(1).max(100).default(20).describe('Page size'),
        keyword: z.string().optional().describe('Search keyword'),
      },
    },
    async ({ page, size, keyword }) => {
      const params: Record<string, string> = paginationParams(page, size);
      if (keyword) params.keyword = keyword;
      return callApi('GET', 'schema/facts', { params });
    },
  );

  server.registerTool(
    'lexq_facts_create',
    {
      title: 'Create Fact Definition',
      description:
        'Register a new input variable. Key starts with a letter, then letters, numbers, and underscores (e.g. paymentAmount). Casing is not enforced. Types: STRING, NUMBER, BOOLEAN, LIST_STRING, LIST_NUMBER.',
      inputSchema: {
        key: z
          .string()
          .regex(FACT_KEY_PATTERN)
          .describe('Variable key. Any casing; must start with a letter.'),
        name: z.string().describe('Display name'),
        type: z.enum(VALUE_TYPES).describe('Value type'),
        description: z.string().optional().describe('Description'),
        isRequired: z
          .boolean()
          .default(false)
          .describe('Whether this fact is required for rule evaluation'),
        isPii: z
          .boolean()
          .default(false)
          .describe(
            'Mark as PII — masked on every read surface, revealable only in the console (audited)',
          ),
      },
    },
    async (args) => callApi('POST', 'schema/facts', { body: args }),
  );

  server.registerTool(
    'lexq_facts_update',
    {
      title: 'Update Fact Definition',
      description:
        'Update a fact definition. The key is immutable. The type can change only while no rule references the fact; if any does, the call fails with FD-007 and reports the count. Only the fields you send are changed. System facts accept name, description, and PII only.',
      inputSchema: {
        factId: z.string().uuid().describe('Fact definition ID'),
        name: z.string().optional().describe('Display name'),
        description: z.string().optional().describe('Description'),
        type: z
          .enum(VALUE_TYPES)
          .optional()
          .describe(
            'Value type. Omit to leave it unchanged. Changing it fails with FD-007 while any rule references the fact.',
          ),
        isRequired: z.boolean().optional().describe('Required flag'),
        isPii: z
          .boolean()
          .optional()
          .describe('PII flag — enables/disables masking (changeable even on system facts)'),
      },
    },
    async ({ factId, ...body }) => callApi('PUT', `schema/facts/${factId}`, { body }),
  );

  server.registerTool(
    'lexq_facts_delete',
    {
      title: 'Delete Fact Definition',
      description:
        'Delete a fact definition. System facts cannot be deleted. Neither can a fact that any rule references: that call fails with FD-006 and reports the count. Remove the references first.',
      inputSchema: {
        factId: z.string().uuid().describe('Fact definition ID'),
      },
    },
    async ({ factId }) => callApi('DELETE', `schema/facts/${factId}`),
  );

  server.registerTool(
    'lexq_facts_action_metadata',
    {
      title: 'Get Action Runtime Fact Metadata',
      description:
        'Retrieve runtime fact requirements per Action type. For each Action, shows which input facts must be present in the execution payload — e.g. MUTATE_FACT always requires its targetVar fact, plus refVar when one is specified. The factRequired flag describes the FACT, not the parameter: refVar is an optional parameter, but if you specify it the named fact must exist. A required fact absent at runtime throws — the engine never defaults to 0. Facts are supplied as input or written by a prior action in the same rule; only SET_FACT creates a fact from nothing. Static data, safe to cache in-session.',
      inputSchema: {},
    },
    async () => callApi('GET', 'schema/action-metadata'),
  );

  server.registerTool(
    'lexq_facts_unregistered',
    {
      title: 'List Unregistered Facts',
      description:
        "List facts referenced by a version's rules but not yet defined (read-only — does not block publish/deploy, INV-4). Version-wide: covers every rule in the version. Each entry carries the inferred type, suggested name, and where it is referenced (condition/action). Register them with lexq_facts_create to enable type validation and the dry-run requirements analyzer.",
      inputSchema: {
        groupId: z.string().uuid().describe('Policy group ID'),
        versionId: z.string().uuid().describe('Version ID'),
      },
    },
    async ({ groupId, versionId }) =>
      callApi('GET', `policy-groups/${groupId}/versions/${versionId}/unregistered-facts`),
  );

  server.registerTool(
    'lexq_facts_export',
    {
      title: 'Export Fact Catalog',
      description:
        'Export the fact catalog. The two formats carry different things: CSV is the catalog as it stands, system facts included, for reading in a spreadsheet; JSON matches the shape that batch create accepts, so it can be fed straight back in, which is why it leaves out the fields that endpoint does not take. Returns the file contents as text.',
      inputSchema: {
        format: z.enum(EXPORT_FORMATS).default('csv').describe('Export format'),
        keyword: z.string().optional().describe('Filter by key or name'),
      },
    },
    async ({ format, keyword }) =>
      callApi('GET', 'schema/facts/export', {
        params: keyword ? { format, keyword } : { format },
      }),
  );
}
