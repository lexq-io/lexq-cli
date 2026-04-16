import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CallApi } from './_shared';
import { paginationParams } from './_shared';

export function registerGroupTools(server: McpServer, callApi: CallApi): void {
  // ── CRUD ──

  server.registerTool(
    'lexq_groups_list',
    {
      title: 'List Policy Groups',
      description: 'List all policy groups with pagination.',
      inputSchema: {
        page: z.number().int().min(0).default(0).describe('Page number (0-indexed)'),
        size: z.number().int().min(1).max(100).default(20).describe('Page size'),
      },
    },
    async ({ page, size }) => {
      const params: Record<string, string> = paginationParams(page, size);
      return callApi('GET', 'policy-groups', { params });
    },
  );

  server.registerTool(
    'lexq_groups_get',
    {
      title: 'Get Policy Group',
      description: 'Get a single policy group by ID.',
      inputSchema: {
        groupId: z.string().uuid().describe('Policy group ID'),
      },
    },
    async ({ groupId }) => callApi('GET', `policy-groups/${groupId}`),
  );

  server.registerTool(
    'lexq_groups_create',
    {
      title: 'Create Policy Group',
      description:
        'Create a new policy group. Requires name and priority. Optionally set conflict resolution, activation group, and description.',
      inputSchema: {
        name: z.string().describe('Group name (unique among non-ARCHIVED)'),
        priority: z.number().int().min(0).describe('Execution priority (lower = higher)'),
        description: z.string().optional().describe('Group description'),
        activationMode: z
          .enum(['NONE', 'EXCLUSIVE', 'MAX_N'])
          .optional()
          .describe('Conflict resolution mode'),
        activationStrategy: z
          .enum(['FIRST_MATCH', 'HIGHEST_PRIORITY', 'MAX_BENEFIT'])
          .optional()
          .describe('Strategy when mode is EXCLUSIVE or MAX_N'),
        executionLimit: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe('Max rule executions (required when mode is MAX_N)'),
        activationGroup: z.string().optional().describe('Activation group name'),
      },
    },
    async (args) => {
      const body: Record<string, unknown> = {
        name: args.name,
        priority: args.priority,
      };
      if (args.description !== undefined) body.description = args.description;
      if (args.activationMode !== undefined) body.activationMode = args.activationMode;
      if (args.activationStrategy !== undefined) body.activationStrategy = args.activationStrategy;
      if (args.executionLimit !== undefined) body.executionLimit = args.executionLimit;
      if (args.activationGroup !== undefined) body.activationGroup = args.activationGroup;
      return callApi('POST', 'policy-groups', { body });
    },
  );

  server.registerTool(
    'lexq_groups_update',
    {
      title: 'Update Policy Group',
      description:
        'Update a policy group. Only provided fields are updated; omitted fields remain unchanged.',
      inputSchema: {
        groupId: z.string().uuid().describe('Policy group ID'),
        name: z.string().optional().describe('New name'),
        priority: z.number().int().min(0).optional().describe('New priority'),
        description: z.string().optional().describe('New description'),
        status: z
          .enum(['ACTIVE', 'DISABLED'])
          .optional()
          .describe('Status (DISABLED = emergency stop)'),
        activationMode: z
          .enum(['NONE', 'EXCLUSIVE', 'MAX_N'])
          .optional()
          .describe('Conflict resolution mode'),
        activationStrategy: z
          .enum(['FIRST_MATCH', 'HIGHEST_PRIORITY', 'MAX_BENEFIT'])
          .optional()
          .describe('Strategy'),
        executionLimit: z.number().int().min(1).optional().describe('Max rule executions'),
      },
    },
    async ({ groupId, ...body }) => callApi('PUT', `policy-groups/${groupId}`, { body }),
  );

  server.registerTool(
    'lexq_groups_delete',
    {
      title: 'Delete Policy Group',
      description:
        'Archive a policy group. Only non-live groups can be deleted. This is irreversible.',
      inputSchema: {
        groupId: z.string().uuid().describe('Policy group ID'),
      },
    },
    async ({ groupId }) => callApi('DELETE', `policy-groups/${groupId}`),
  );

  // ── A/B Test ──

  server.registerTool(
    'lexq_ab_test_start',
    {
      title: 'Start A/B Test',
      description:
        'Start an A/B test on a policy group. Requires a challenger version ID and traffic rate.',
      inputSchema: {
        groupId: z.string().uuid().describe('Policy group ID'),
        testVersionId: z.string().uuid().describe('Challenger version ID to test'),
        trafficRate: z
          .number()
          .int()
          .min(1)
          .max(99)
          .describe('Traffic percentage routed to challenger (1-99)'),
      },
    },
    async ({ groupId, ...body }) => callApi('POST', `policy-groups/${groupId}/ab-test`, { body }),
  );

  server.registerTool(
    'lexq_ab_test_stop',
    {
      title: 'Stop A/B Test',
      description:
        'Stop a running A/B test. All traffic is restored to the control (current) version.',
      inputSchema: {
        groupId: z.string().uuid().describe('Policy group ID'),
      },
    },
    async ({ groupId }) => callApi('DELETE', `policy-groups/${groupId}/ab-test`),
  );

  server.registerTool(
    'lexq_ab_test_adjust',
    {
      title: 'Adjust A/B Test',
      description: 'Adjust traffic rate of a running A/B test.',
      inputSchema: {
        groupId: z.string().uuid().describe('Policy group ID'),
        trafficRate: z
          .number()
          .int()
          .min(1)
          .max(99)
          .describe('New traffic percentage for challenger (1-99)'),
      },
    },
    async ({ groupId, ...body }) =>
      callApi('PATCH', `policy-groups/${groupId}/ab-test/traffic-rate`, { body }),
  );
}
