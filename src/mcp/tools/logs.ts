import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callApi, paginationParams } from './_shared';

export function registerLogTools(server: McpServer): void {
    server.registerTool(
        'lexq_logs_list',
        {
            title: 'List Failure Logs',
            description:
                'List system failure logs from background tasks (webhook calls, coupon issuance, etc.).',
            inputSchema: {
                page: z.number().int().min(0).default(0).describe('Page number'),
                size: z.number().int().min(1).max(100).default(20).describe('Page size'),
                category: z
                    .enum(['INTEGRATION', 'INTERNAL'])
                    .optional()
                    .describe('Task category'),
                taskType: z
                    .enum([
                        'COUPON_ISSUE',
                        'POINT_EARN',
                        'NOTIFICATION_SEND',
                        'WEBHOOK_EXECUTE',
                    ])
                    .optional()
                    .describe('Task type'),
                status: z
                    .enum(['PENDING', 'RESOLVED', 'IGNORED'])
                    .optional()
                    .describe('Log status'),
                keyword: z
                    .string()
                    .optional()
                    .describe('Search in refId, refSubId, errorMessage'),
                startDate: z.string().optional().describe('Start date (yyyy-MM-dd)'),
                endDate: z.string().optional().describe('End date (yyyy-MM-dd)'),
            },
        },
        async ({ page, size, category, taskType, status, keyword, startDate, endDate }) => {
            const params: Record<string, string> = paginationParams(page, size);
            if (category) params.category = category;
            if (taskType) params.taskType = taskType;
            if (status) params.status = status;
            if (keyword) params.keyword = keyword;
            if (startDate) params.startDate = startDate;
            if (endDate) params.endDate = endDate;
            return callApi('GET', 'failure-logs', { params });
        }
    );

    server.registerTool(
        'lexq_logs_get',
        {
            title: 'Get Failure Log',
            description: 'Get failure log detail by ID.',
            inputSchema: {
                logId: z.string().uuid().describe('Failure log ID'),
            },
        },
        async ({ logId }) => callApi('GET', `failure-logs/${logId}`)
    );

    server.registerTool(
        'lexq_logs_action',
        {
            title: 'Process Failure Log',
            description: 'Process a single failure log: RETRY, RESOLVE, or IGNORE.',
            inputSchema: {
                logId: z.string().uuid().describe('Failure log ID'),
                action: z
                    .enum(['RETRY', 'RESOLVE', 'IGNORE'])
                    .describe('Action to take'),
            },
        },
        async ({ logId, action }) =>
            callApi('POST', `failure-logs/${logId}/actions`, {
                body: { action },
            })
    );

    server.registerTool(
        'lexq_logs_bulk_action',
        {
            title: 'Bulk Process Failure Logs',
            description:
                'Process multiple failure logs at once. Provide an array of log IDs and the action.',
            inputSchema: {
                logIds: z
                    .array(z.string().uuid())
                    .describe('Array of failure log IDs'),
                action: z
                    .enum(['RETRY', 'RESOLVE', 'IGNORE'])
                    .describe('Action to apply to all logs'),
            },
        },
        async ({ logIds, action }) =>
            callApi('POST', 'failure-logs/bulk-actions', {
                body: { logIds, action },
            })
    );
}