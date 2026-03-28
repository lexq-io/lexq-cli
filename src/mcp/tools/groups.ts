import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callApi, paginationParams } from './_shared';

export function registerGroupTools(server: McpServer): void {
    // ── CRUD ──

    server.registerTool(
        'lexq_groups_list',
        {
            title: 'List Policy Groups',
            description:
                'List all policy groups. Supports pagination and optional status/keyword filters.',
            inputSchema: {
                page: z.number().int().min(0).default(0).describe('Page number (0-indexed)'),
                size: z.number().int().min(1).max(100).default(20).describe('Page size'),
                status: z
                    .enum(['ACTIVE', 'DISABLED', 'ARCHIVED'])
                    .optional()
                    .describe('Filter by status'),
                keyword: z.string().optional().describe('Search keyword'),
            },
        },
        async ({ page, size, status, keyword }) => {
            const params: Record<string, string> = paginationParams(page, size);
            if (status) params.status = status;
            if (keyword) params.keyword = keyword;
            return callApi('GET', 'policy-groups', { params });
        }
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
        async ({ groupId }) => callApi('GET', `policy-groups/${groupId}`)
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
                conflictResolutionMode: z
                    .enum(['NONE', 'EXCLUSIVE', 'MAX_N'])
                    .optional()
                    .describe('Conflict resolution mode'),
                conflictResolutionStrategy: z
                    .enum(['FIRST_MATCH', 'HIGHEST_PRIORITY', 'MAX_BENEFIT'])
                    .optional()
                    .describe('Strategy when mode is EXCLUSIVE or MAX_N'),
                maxSelections: z
                    .number()
                    .int()
                    .min(1)
                    .optional()
                    .describe('Max selections (required when mode is MAX_N)'),
                activationGroupId: z.string().uuid().optional().describe('Activation group ID'),
            },
        },
        async (args) => {
            const body: Record<string, unknown> = {
                name: args.name,
                priority: args.priority,
            };
            if (args.description !== undefined) body.description = args.description;
            if (args.conflictResolutionMode !== undefined)
                body.conflictResolutionMode = args.conflictResolutionMode;
            if (args.conflictResolutionStrategy !== undefined)
                body.conflictResolutionStrategy = args.conflictResolutionStrategy;
            if (args.maxSelections !== undefined) body.maxSelections = args.maxSelections;
            if (args.activationGroupId !== undefined)
                body.activationGroupId = args.activationGroupId;
            return callApi('POST', 'policy-groups', { body });
        }
    );

    server.registerTool(
        'lexq_groups_update',
        {
            title: 'Update Policy Group',
            description: 'Update an existing policy group. Only provided fields are updated.',
            inputSchema: {
                groupId: z.string().uuid().describe('Policy group ID'),
                name: z.string().optional().describe('New name'),
                priority: z.number().int().min(0).optional().describe('New priority'),
                description: z.string().optional().describe('New description'),
                status: z
                    .enum(['ACTIVE', 'DISABLED'])
                    .optional()
                    .describe('Status (DISABLED = emergency stop)'),
                conflictResolutionMode: z
                    .enum(['NONE', 'EXCLUSIVE', 'MAX_N'])
                    .optional()
                    .describe('Conflict resolution mode'),
                conflictResolutionStrategy: z
                    .enum(['FIRST_MATCH', 'HIGHEST_PRIORITY', 'MAX_BENEFIT'])
                    .optional()
                    .describe('Strategy'),
                maxSelections: z.number().int().min(1).optional().describe('Max selections'),
            },
        },
        async ({ groupId, ...body }) =>
            callApi('PATCH', `policy-groups/${groupId}`, { body })
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
        async ({ groupId }) => callApi('DELETE', `policy-groups/${groupId}`)
    );

    // ── A/B Test ──

    server.registerTool(
        'lexq_ab_test_start',
        {
            title: 'Start A/B Test',
            description:
                'Start an A/B test on a policy group. Requires a challenger version ID and traffic split percentages.',
            inputSchema: {
                groupId: z.string().uuid().describe('Policy group ID'),
                challengerVersionId: z.string().uuid().describe('Challenger version ID'),
                controlWeight: z
                    .number()
                    .int()
                    .min(1)
                    .max(99)
                    .describe('Control traffic weight (%)'),
                challengerWeight: z
                    .number()
                    .int()
                    .min(1)
                    .max(99)
                    .describe('Challenger traffic weight (%)'),
                identityKey: z
                    .string()
                    .optional()
                    .describe('Fact key for sticky assignment (e.g. customer_id)'),
            },
        },
        async ({ groupId, ...body }) =>
            callApi('POST', `policy-groups/${groupId}/ab-test/start`, { body })
    );

    server.registerTool(
        'lexq_ab_test_stop',
        {
            title: 'Stop A/B Test',
            description: 'Stop a running A/B test. Specify which version to keep.',
            inputSchema: {
                groupId: z.string().uuid().describe('Policy group ID'),
                winnerVersionId: z.string().uuid().describe('Version ID to keep as live'),
            },
        },
        async ({ groupId, ...body }) =>
            callApi('POST', `policy-groups/${groupId}/ab-test/stop`, { body })
    );

    server.registerTool(
        'lexq_ab_test_adjust',
        {
            title: 'Adjust A/B Test',
            description: 'Adjust traffic weights of a running A/B test.',
            inputSchema: {
                groupId: z.string().uuid().describe('Policy group ID'),
                controlWeight: z.number().int().min(1).max(99).describe('New control weight (%)'),
                challengerWeight: z
                    .number()
                    .int()
                    .min(1)
                    .max(99)
                    .describe('New challenger weight (%)'),
            },
        },
        async ({ groupId, ...body }) =>
            callApi('POST', `policy-groups/${groupId}/ab-test/adjust`, { body })
    );
}