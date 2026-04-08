import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CallApi } from './_shared';
import { paginationParams } from './_shared';

export function registerHistoryTools(server: McpServer, callApi: CallApi): void {
  server.registerTool(
    'lexq_history_list',
    {
      title: 'List Execution History',
      description:
        'List policy execution history. Shows trace ID, group, version, status, match result, and latency.',
      inputSchema: {
        page: z.number().int().min(0).default(0).describe('Page number'),
        size: z.number().int().min(1).max(100).default(20).describe('Page size'),
        traceId: z.string().optional().describe('Filter by trace ID'),
        groupId: z.string().uuid().optional().describe('Filter by policy group'),
        versionId: z.string().uuid().optional().describe('Filter by version'),
        status: z
          .enum(['SUCCESS', 'NO_MATCH', 'ERROR', 'TIMEOUT'])
          .optional()
          .describe('Filter by execution status'),
        startDate: z.string().optional().describe('Start date (yyyy-MM-dd)'),
        endDate: z.string().optional().describe('End date (yyyy-MM-dd)'),
      },
    },
    async ({ page, size, traceId, groupId, versionId, status, startDate, endDate }) => {
      const params: Record<string, string> = paginationParams(page, size);
      if (traceId) params.traceId = traceId;
      if (groupId) params.policyGroupId = groupId;
      if (versionId) params.versionId = versionId;
      if (status) params.status = status;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      return callApi('GET', 'execution/history', { params });
    },
  );

  server.registerTool(
    'lexq_history_get',
    {
      title: 'Get Execution Detail',
      description:
        'Get full execution detail including request facts, result traces, and decision traces.',
      inputSchema: {
        executionId: z.string().uuid().describe('Execution history ID'),
      },
    },
    async ({ executionId }) => callApi('GET', `execution/history/${executionId}`),
  );

  server.registerTool(
    'lexq_history_stats',
    {
      title: 'Execution Statistics',
      description:
        'Get execution KPIs: total executions, success/failure counts, success rate, and average latency.',
      inputSchema: {
        groupId: z.string().uuid().optional().describe('Filter by policy group'),
        startDate: z.string().optional().describe('Start date (yyyy-MM-dd)'),
        endDate: z.string().optional().describe('End date (yyyy-MM-dd)'),
      },
    },
    async ({ groupId, startDate, endDate }) => {
      const params: Record<string, string> = {};
      if (groupId) params.policyGroupId = groupId;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      return callApi('GET', 'execution/history/stats', { params });
    },
  );
}
