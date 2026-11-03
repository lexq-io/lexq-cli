import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { CallApi } from './_shared';
import { READ_ONLY, paginationParams } from './_shared';
import { FailureStatus, TaskType } from '@/types/enums';
import { END_DAY, START_DAY } from '@/lib/dates';
import { FAILURE_LOG_LOOKBACK_DAYS } from '@/types/constants';
import { FAILURE_LOG_CONSOLE_NOTE } from '@/lib/console';

export function registerLogTools(server: McpServer, callApi: CallApi): void {
  server.registerTool(
    'lexq_logs_list',
    {
      title: 'List Failure Logs',
      annotations: READ_ONLY,
      description: `List system failure logs from background tasks (platform event webhooks, scheduled deployments). Without dates the window is ${FAILURE_LOG_LOOKBACK_DAYS} days back through today, in the organization time zone; pass startDate to look further back. ${FAILURE_LOG_CONSOLE_NOTE}`,
      inputSchema: z.object({
        page: z.number().int().min(0).default(0).describe('Page number'),
        size: z.number().int().min(1).max(100).default(20).describe('Page size'),
        taskType: z.enum(TaskType).optional().describe('Task type'),
        status: z.enum(FailureStatus).optional().describe('Log status'),
        keyword: z.string().optional().describe('Search in refId, refSubId, errorMessage'),
        startDate: z.string().optional().describe(START_DAY),
        endDate: z.string().optional().describe(END_DAY),
      }),
    },
    async ({ page, size, taskType, status, keyword, startDate, endDate }) => {
      const params: Record<string, string> = paginationParams(page, size);
      if (taskType) params.taskType = taskType;
      if (status) params.status = status;
      if (keyword) params.keyword = keyword;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      return callApi('GET', 'failure-logs', { params });
    },
  );

  server.registerTool(
    'lexq_logs_get',
    {
      title: 'Get Failure Log',
      annotations: READ_ONLY,
      description: `Get failure log detail by ID. ${FAILURE_LOG_CONSOLE_NOTE}`,
      inputSchema: z.object({
        logId: z.string().uuid().describe('Failure log ID'),
      }),
    },
    async ({ logId }) => callApi('GET', `failure-logs/${logId}`),
  );
}
