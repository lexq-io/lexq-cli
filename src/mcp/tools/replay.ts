import { REPLAY_WINDOW_MAX_RECORDS } from '@/types/constants';
import { DRY_RUN_LIMIT_NOTE } from '@/lib/dry-run-limit';
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { CallApi } from './_shared';
import {
  READ_ONLY,
  DESTRUCTIVE,
  EXPORT_LIMIT_NOTE,
  limitExport,
  paginationParams,
} from './_shared';
import { EXPORT_FORMATS } from '@/lib/export';
import { WINDOW_END_DAY, WINDOW_START_DAY } from '@/lib/dates';

export function registerReplayTools(server: McpServer, callApi: CallApi): void {
  server.registerTool(
    'lexq_replay_decision',
    {
      title: 'Replay a Decision',
      annotations: READ_ONLY,
      description: `Re-evaluate a past execution (traceId) against a candidate version and return the decision diff (decisionChanged, effect changes, fired rules) plus a determinism verdict. Synchronous. ${DRY_RUN_LIMIT_NOTE} A replay sends no webhook, notification, or event: rule actions produce no outward effects.`,
      inputSchema: z.object({
        traceId: z.string().describe('Trace ID of the past execution to replay'),
        candidateVersionId: z.string().uuid().describe('Version to re-evaluate against'),
      }),
    },
    async ({ traceId, candidateVersionId }) =>
      callApi('POST', 'replay/decisions', { body: { traceId, candidateVersionId } }),
  );

  server.registerTool(
    'lexq_replay_start',
    {
      title: 'Start Window Replay (Blast Radius)',
      annotations: DESTRUCTIVE,
      description:
        'Submit an async job that replays a date window of past executions against a candidate version and measures the blast radius (how many decisions change). Billed per replayed record (REPLAY metric); VIEWER role cannot submit. Poll with lexq_replay_status.',
      inputSchema: z.object({
        candidateVersionId: z.string().uuid().describe('Version to re-evaluate against'),
        from: z.string().describe(WINDOW_START_DAY),
        to: z.string().describe(WINDOW_END_DAY),
        maxRecords: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe(
            `Sample cap (server default applies; hard cap ${REPLAY_WINDOW_MAX_RECORDS / 1000}k)`,
          ),
      }),
    },
    async ({ candidateVersionId, from, to, maxRecords }) =>
      callApi('POST', 'replay/jobs', { body: { candidateVersionId, from, to, maxRecords } }),
  );

  server.registerTool(
    'lexq_replay_status',
    {
      title: 'Get Replay Job Status',
      annotations: READ_ONLY,
      description:
        'Poll a window replay job. RUNNING shows progress 0–100; COMPLETED fills summary and changedSamples; FAILED carries errorMessage. capped=true means the window exceeded the sample cap and only part was replayed.',
      inputSchema: z.object({
        jobId: z.string().describe('Replay job ID from lexq_replay_start'),
      }),
    },
    async ({ jobId }) => callApi('GET', `replay/jobs/${jobId}`),
  );

  server.registerTool(
    'lexq_replay_list',
    {
      title: 'List Replay Jobs',
      annotations: READ_ONLY,
      description:
        'List window replay job history (reverse-chronological). Lightweight items — use lexq_replay_status for summary and changed samples.',
      inputSchema: z.object({
        page: z.number().int().min(0).default(0).describe('Page number'),
        size: z.number().int().min(1).max(100).default(20).describe('Page size'),
      }),
    },
    async ({ page, size }) =>
      callApi('GET', 'replay/jobs', { params: paginationParams(page, size) }),
  );

  server.registerTool(
    'lexq_replay_cancel',
    {
      title: 'Cancel Replay Job',
      annotations: DESTRUCTIVE,
      description:
        'Cancel a PENDING or RUNNING window replay job. Other states are rejected. VIEWER role cannot cancel.',
      inputSchema: z.object({
        jobId: z.string().describe('Replay job ID'),
      }),
    },
    async ({ jobId }) => callApi('POST', `replay/jobs/${jobId}/cancel`),
  );

  server.registerTool(
    'lexq_replay_export',
    {
      title: 'Export Replay Result',
      annotations: READ_ONLY,
      description: `Export a COMPLETED window replay job; a job that has not completed is rejected. The two formats carry different things: CSV holds the effect blast radius, whose columns are fixed; JSON holds the changed samples and action parameters, which nest and whose keys differ per tenant. JSON is not a superset of CSV. Returns the file contents as text. ${EXPORT_LIMIT_NOTE}`,
      inputSchema: z.object({
        jobId: z.string().describe('Replay job ID'),
        format: z.enum(EXPORT_FORMATS).default('json').describe('Export format'),
      }),
    },
    async ({ jobId, format }) =>
      limitExport(
        await callApi('GET', `replay/jobs/${jobId}/export`, { params: { format } }),
        `lexq replay export --id ${jobId} --as ${format} --output <file>`,
      ),
  );
}
