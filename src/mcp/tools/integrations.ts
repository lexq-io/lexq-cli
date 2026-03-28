import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callApi, paginationParams } from './_shared';

export function registerIntegrationTools(server: McpServer): void {
    server.registerTool(
        'lexq_integrations_list',
        {
            title: 'List Integrations',
            description: 'List all external integrations (webhooks, CRM, notification, etc.).',
            inputSchema: {
                page: z.number().int().min(0).default(0).describe('Page number'),
                size: z.number().int().min(1).max(100).default(20).describe('Page size'),
                type: z
                    .enum(['COUPON', 'POINT', 'NOTIFICATION', 'CRM', 'MESSENGER', 'WEBHOOK'])
                    .optional()
                    .describe('Filter by integration type'),
            },
        },
        async ({ page, size, type }) => {
            const params: Record<string, string> = paginationParams(page, size);
            if (type) params.type = type;
            return callApi('GET', 'integrations', { params });
        }
    );

    server.registerTool(
        'lexq_integrations_get',
        {
            title: 'Get Integration',
            description: 'Get integration detail by ID.',
            inputSchema: {
                integrationId: z.string().uuid().describe('Integration ID'),
            },
        },
        async ({ integrationId }) =>
            callApi('GET', `integrations/${integrationId}`)
    );

    server.registerTool(
        'lexq_integrations_save',
        {
            title: 'Save Integration',
            description:
                'Create or update an integration. Types: COUPON, POINT, NOTIFICATION, CRM, MESSENGER, WEBHOOK.',
            inputSchema: {
                type: z
                    .enum(['COUPON', 'POINT', 'NOTIFICATION', 'CRM', 'MESSENGER', 'WEBHOOK'])
                    .describe('Integration type'),
                name: z.string().describe('Integration name'),
                baseUrl: z.string().describe('Base URL of the external service'),
                apiKey: z.string().optional().describe('API key or token for the service'),
                isActive: z.boolean().default(true).describe('Whether the integration is active'),
                config: z
                    .string()
                    .optional()
                    .describe('JSON string of additional config key-value pairs'),
            },
        },
        async ({ config, ...rest }) => {
            const body: Record<string, unknown> = { ...rest };
            if (config) body.config = JSON.parse(config);
            return callApi('POST', 'integrations', { body });
        }
    );

    server.registerTool(
        'lexq_integrations_delete',
        {
            title: 'Delete Integration',
            description: 'Delete an integration by ID.',
            inputSchema: {
                integrationId: z.string().uuid().describe('Integration ID'),
            },
        },
        async ({ integrationId }) =>
            callApi('DELETE', `integrations/${integrationId}`)
    );

    server.registerTool(
        'lexq_integrations_config_spec',
        {
            title: 'Integration Config Spec',
            description:
                'Show available integration types and their required configuration fields.',
            inputSchema: {},
        },
        async () => callApi('GET', 'integrations/config-spec')
    );
}