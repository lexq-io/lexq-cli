import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callApi, paginationParams } from './_shared';

// Condition/Action are deeply nested JSON — accept as opaque object via z.record.
// The engine validates structure. MCP schema describes the shape in descriptions.

export function registerRuleTools(server: McpServer): void {
    server.registerTool(
        'lexq_rules_list',
        {
            title: 'List Rules',
            description: 'List all rules in a version. Returns summary with conditionSummary and actionSummary.',
            inputSchema: {
                groupId: z.string().uuid().describe('Policy group ID'),
                versionId: z.string().uuid().describe('Version ID'),
                page: z.number().int().min(0).default(0).describe('Page number'),
                size: z.number().int().min(1).max(100).default(20).describe('Page size'),
            },
        },
        async ({ groupId, versionId, page, size }) =>
            callApi('GET', `policy-groups/${groupId}/versions/${versionId}/rules`, {
                params: paginationParams(page, size),
            })
    );

    server.registerTool(
        'lexq_rules_get',
        {
            title: 'Get Rule Detail',
            description:
                'Get full rule detail including condition tree and action definitions.',
            inputSchema: {
                groupId: z.string().uuid().describe('Policy group ID'),
                versionId: z.string().uuid().describe('Version ID'),
                ruleId: z.string().uuid().describe('Rule ID'),
            },
        },
        async ({ groupId, versionId, ruleId }) =>
            callApi(
                'GET',
                `policy-groups/${groupId}/versions/${versionId}/rules/${ruleId}`
            )
    );

    server.registerTool(
        'lexq_rules_create',
        {
            title: 'Create Rule',
            description: `Create a rule in a DRAFT version. Requires name, priority, condition tree, and actions array.

Condition: { type: "SINGLE", field, operator, value, valueType } or { type: "GROUP", operator: "AND"|"OR", children: [...] }
Operators: EQUALS, NOT_EQUALS, GREATER_THAN, GREATER_THAN_OR_EQUAL, LESS_THAN, LESS_THAN_OR_EQUAL, CONTAINS, IN, NOT_IN
Value types: STRING, NUMBER, BOOLEAN, LIST_STRING, LIST_NUMBER

Actions: [{ type, parameters }]
Types: DISCOUNT, POINT, COUPON_ISSUE, BLOCK, NOTIFICATION, WEBHOOK, SET_FACT, ADD_TAG`,
            inputSchema: {
                groupId: z.string().uuid().describe('Policy group ID'),
                versionId: z.string().uuid().describe('Version ID'),
                rule: z
                    .string()
                    .describe(
                        'JSON string of CreateRuleRequest: { name, priority, condition, actions, mutexGroup?, mutexMode?, mutexStrategy?, mutexLimit?, isEnabled? }'
                    ),
            },
        },
        async ({ groupId, versionId, rule }) => {
            const body: unknown = JSON.parse(rule);
            return callApi(
                'POST',
                `policy-groups/${groupId}/versions/${versionId}/rules`,
                { body }
            );
        }
    );

    server.registerTool(
        'lexq_rules_update',
        {
            title: 'Update Rule',
            description:
                'Update an existing rule in a DRAFT version. Only provided fields are changed.',
            inputSchema: {
                groupId: z.string().uuid().describe('Policy group ID'),
                versionId: z.string().uuid().describe('Version ID'),
                ruleId: z.string().uuid().describe('Rule ID'),
                rule: z
                    .string()
                    .describe(
                        'JSON string of UpdateRuleRequest: { name?, priority?, condition?, actions?, mutexGroup?, mutexMode?, mutexStrategy?, mutexLimit?, isEnabled? }'
                    ),
            },
        },
        async ({ groupId, versionId, ruleId, rule }) => {
            const body: unknown = JSON.parse(rule);
            return callApi(
                'PATCH',
                `policy-groups/${groupId}/versions/${versionId}/rules/${ruleId}`,
                { body }
            );
        }
    );

    server.registerTool(
        'lexq_rules_delete',
        {
            title: 'Delete Rule',
            description: 'Delete a rule from a DRAFT version.',
            inputSchema: {
                groupId: z.string().uuid().describe('Policy group ID'),
                versionId: z.string().uuid().describe('Version ID'),
                ruleId: z.string().uuid().describe('Rule ID'),
                force: z
                    .boolean()
                    .default(false)
                    .describe('Skip confirmation (for the last rule in a version)'),
            },
        },
        async ({ groupId, versionId, ruleId, force }) => {
            const params: Record<string, string> = {};
            if (force) params.force = 'true';
            return callApi(
                'DELETE',
                `policy-groups/${groupId}/versions/${versionId}/rules/${ruleId}`,
                { params }
            );
        }
    );

    server.registerTool(
        'lexq_rules_reorder',
        {
            title: 'Reorder Rules',
            description:
                'Reorder rules by specifying rule IDs and their new priorities. Array index 0 = highest priority.',
            inputSchema: {
                groupId: z.string().uuid().describe('Policy group ID'),
                versionId: z.string().uuid().describe('Version ID'),
                ruleIds: z
                    .array(z.string().uuid())
                    .describe('Rule IDs in desired priority order'),
            },
        },
        async ({ groupId, versionId, ruleIds }) => {
            const rules = ruleIds.map((ruleId: string, index: number) => ({
                ruleId,
                priority: index,
            }));
            return callApi(
                'PUT',
                `policy-groups/${groupId}/versions/${versionId}/rules/reorder`,
                { body: { rules } }
            );
        }
    );

    server.registerTool(
        'lexq_rules_toggle',
        {
            title: 'Toggle Rule',
            description: 'Enable or disable a rule without deleting it.',
            inputSchema: {
                groupId: z.string().uuid().describe('Policy group ID'),
                versionId: z.string().uuid().describe('Version ID'),
                ruleId: z.string().uuid().describe('Rule ID'),
                isEnabled: z.boolean().describe('true to enable, false to disable'),
            },
        },
        async ({ groupId, versionId, ruleId, isEnabled }) =>
            callApi(
                'PATCH',
                `policy-groups/${groupId}/versions/${versionId}/rules/${ruleId}/toggle`,
                { body: { isEnabled } }
            )
    );
}