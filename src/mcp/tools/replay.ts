import { REPLAY_WINDOW_MAX_RECORDS } from '@/types/constants';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CallApi } from './_shared';
import { paginationParams } from './_shared';

export function registerReplayTools(server: McpServer, callApi: CallApi): void {
  server.registerTool(
    'lexq_replay_decision',
    {
      title: 'Replay a Decision',
      description:
        'Re-evaluate a past execution (traceId) against a candidate version and return the decision diff (decisionChanged, effect changes, fired rules) plus a determinism verdict. Synchronous and free of charge (TPS throttle only). A replay sends no webhook, notification, or event: rule actions produce no outward effects.',
      inputSchema: {
        traceId: z.string().describe('Trace ID of the past execution to replay'),
        candidateVersionId: z.string().uuid().describe('Version to re-evaluate against'),
      },
    },
    async ({ traceId, candidateVersionId }) =>
      callApi('POST', 'replay/decisions', { body: { traceId, candidateVersionId } }),
  );

  server.registerTool(
    'lexq_replay_start',
    {
      title: 'Start Window Replay (Blast Radius)',
      description:
        'Submit an async job that replays a date window of past executions against a candidate version and measures the blast radius (how many decisions change). Billed per replayed record (REPLAY metric); VIEWER role cannot submit. Poll with lexq_replay_status.',
      inputSchema: {
        candidateVersionId: z.string().uuid().describe('Version to re-evaluate against'),
        from: z.string().describe('Window start date (yyyy-MM-dd)'),
        to: z.string().describe('Window end date (yyyy-MM-dd)'),
        maxRecords: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe(
            `Sample cap (server default applies; hard cap ${REPLAY_WINDOW_MAX_RECORDS / 1000}k)`,
          ),
      },
    },
    async ({ candidateVersionId, from, to, maxRecords }) =>
      callApi('POST', 'replay/jobs', { body: { candidateVersionId, from, to, maxRecords } }),
  );

  server.registerTool(
    'lexq_replay_status',
    {
      title: 'Get Replay Job Status',
      description:
        'Poll a window replay job. RUNNING shows progress 0–100; COMPLETED fills summary and changedSamples; FAILED carries errorMessage. capped=true means the window exceeded the sample cap and only part was replayed.',
      inputSchema: {
        jobId: z.string().describe('Replay job ID from lexq_replay_start'),
      },
    },
    async ({ jobId }) => callApi('GET', `replay/jobs/${jobId}`),
  );

  server.registerTool(
    'lexq_replay_list',
    {
      title: 'List Replay Jobs',
      description:
        'List window replay job history (reverse-chronological). Lightweight items — use lexq_replay_status for summary and changed samples.',
      inputSchema: {
        page: z.number().int().min(0).default(0).describe('Page number'),
        size: z.number().int().min(1).max(100).default(20).describe('Page size'),
      },
    },
    async ({ page, size }) =>
      callApi('GET', 'replay/jobs', { params: paginationParams(page, size) }),
  );

  server.registerTool(
    'lexq_replay_cancel',
    {
      title: 'Cancel Replay Job',
      description:
        'Cooperatively cancel a PENDING or RUNNING window replay job. Other states are rejected. VIEWER role cannot cancel.',
      inputSchema: {
        jobId: z.string().describe('Replay job ID'),
      },
    },
    async ({ jobId }) => callApi('POST', `replay/jobs/${jobId}/cancel`),
  );

  server.registerTool(
    'lexq_replay_export',
    {
      title: 'Export Replay Result',
      description:
        'Export a COMPLETED window replay job. A running job is rejected — a partial result reads as the whole thing on the receiving end. The two formats carry different things: CSV holds the effect blast radius, whose columns are fixed; JSON holds the changed samples and action parameters, which nest and whose keys differ per tenant. JSON is not a superset of CSV. Returns the file contents as text.',
      inputSchema: {
        jobId: z.string().describe('Replay job ID'),
        format: z.enum(['json', 'csv']).default('json').describe('Export format'),
      },
    },
    async ({ jobId, format }) =>
      callApi('GET', `replay/jobs/${jobId}/export`, { params: { format } }),
  );
}
