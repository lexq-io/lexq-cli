import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CallApi } from './_shared';
import { paginationParams } from './_shared';

export function registerFactTools(server: McpServer, callApi: CallApi): void {
  server.registerTool(
    'lexq_facts_list',
    {
      title: 'List Fact Definitions',
      description:
        'List all fact definitions (input variable schema). Shows key, type, and required status. Always check this before creating rules.',
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
        'Register a new input variable. Key must be lowercase with underscores (e.g. payment_amount). Types: STRING, NUMBER, BOOLEAN, LIST_STRING, LIST_NUMBER.',
      inputSchema: {
        key: z
          .string()
          .regex(/^[a-z][a-z0-9_]*$/)
          .describe('Variable key (snake_case)'),
        name: z.string().describe('Display name'),
        type: z
          .enum(['STRING', 'NUMBER', 'BOOLEAN', 'LIST_STRING', 'LIST_NUMBER'])
          .describe('Value type'),
        description: z.string().optional().describe('Description'),
        isRequired: z
          .boolean()
          .default(false)
          .describe('Whether this fact is required for rule evaluation'),
      },
    },
    async (args) => callApi('POST', 'schema/facts', { body: args }),
  );

  server.registerTool(
    'lexq_facts_update',
    {
      title: 'Update Fact Definition',
      description:
        'Update a fact definition. Key and type cannot be changed. System facts only allow name and description changes.',
      inputSchema: {
        factId: z.string().uuid().describe('Fact definition ID'),
        name: z.string().describe('Display name'),
        description: z.string().optional().describe('Description'),
        isRequired: z.boolean().describe('Required flag'),
      },
    },
    async ({ factId, ...body }) => callApi('PATCH', `schema/facts/${factId}`, { body }),
  );

  server.registerTool(
    'lexq_facts_delete',
    {
      title: 'Delete Fact Definition',
      description: 'Delete a fact definition. System facts cannot be deleted.',
      inputSchema: {
        factId: z.string().uuid().describe('Fact definition ID'),
      },
    },
    async ({ factId }) => callApi('DELETE', `schema/facts/${factId}`),
  );
}
