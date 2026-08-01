import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import dedent from 'dedent';
import type { CallApi } from './_shared';
import { paginationParams } from './_shared';

export function registerAnalyticsTools(server: McpServer, callApi: CallApi): void {
  // ── Dry Run ──

  server.registerTool(
    'lexq_dry_run',
    {
      title: 'Dry Run',
      description: dedent`
        Execute a single dry run against a version. Tests how rules evaluate given input facts without side effects.
        
        Returns:
          inputFacts        — normalized input facts
          mutatedFacts      — input facts changed by rule actions (e.g. MUTATE_FACT mutates payment_amount)
          generatedVariables — system-generated values; every fact in mutatedFacts gets a paired {fact_name}__delta key (signed difference)
          executionTraces   — per-rule match status
          decisionTraces    — per-rule decision (SELECTED / NO_MATCH / BLOCKED / etc.)
        
        Example input: { "facts": { "payment_amount": 100000, "customer_tier": "VIP" } }
        Always dry-run before publishing to validate rule behavior.`,
      inputSchema: {
        versionId: z.string().uuid().describe('Policy version ID to test against'),
        facts: z.string().describe('JSON string of facts object, e.g. {"payment_amount":100000}'),
        includeDebugInfo: z
          .boolean()
          .default(true)
          .describe('Include execution and decision traces'),
      },
    },
    async ({ versionId, facts, includeDebugInfo }) => {
      const parsedFacts: unknown = JSON.parse(facts);
      return callApi('POST', `analytics/dry-run/versions/${versionId}`, {
        body: { facts: parsedFacts, includeDebugInfo },
      });
    },
  );

  // ── Dry Run Compare ──

  server.registerTool(
    'lexq_dry_run_compare',
    {
      title: 'Dry Run Compare',
      description: dedent`
        Compare dry run results between two versions using the same input facts. Useful for validating changes.
        
        Returns:
          resultA / resultB — full DryRunResponse for each version
          diff.mutatedDiff   — changes in mutatedFacts between A and B (key → {before, after})
          diff.generatedDiff — changes in generatedVariables between A and B`,
      inputSchema: {
        versionIdA: z.string().uuid().describe('Baseline version ID'),
        versionIdB: z.string().uuid().describe('Candidate version ID'),
        facts: z.string().describe('JSON string of facts object'),
      },
    },
    async ({ versionIdA, versionIdB, facts }) => {
      const parsedFacts: unknown = JSON.parse(facts);
      return callApi('POST', 'analytics/dry-run/compare', {
        body: { versionIdA, versionIdB, facts: parsedFacts },
      });
    },
  );

  // ── Requirements ──

  server.registerTool(
    'lexq_requirements',
    {
      title: 'Analyze Requirements',
      description:
        'Analyze which input facts a version requires. Returns required keys, types, and an example request body.',
      inputSchema: {
        groupId: z.string().uuid().describe('Policy group ID'),
        versionId: z.string().uuid().describe('Version ID'),
      },
    },
    async ({ groupId, versionId }) =>
      callApi('GET', `analytics/groups/${groupId}/versions/${versionId}/requirements`),
  );

  // ── Simulation ──

  server.registerTool(
    'lexq_simulation_start',
    {
      title: 'Start Simulation',
      description: dedent`
        Start an Impact Simulation against historical, uploaded, or inline data.

        dataset.type and dataset.source are BOTH required, and must be paired:
          HISTORICAL → source EXECUTION_LOGS, with dataset.from / dataset.to (yyyy-MM-dd)
          UPLOADED   → source S3_BUCKET,      with dataset.path (the path returned by lexq_dataset_upload)
          MANUAL     → source REQUEST_BODY,   with dataset.manualData (array of fact records)

        options.maxRecords: number (max 100000, default 10000)
        options.baselinePolicyVersionId: uuid (optional, for baseline comparison)
        options.includeRuleStats: boolean
        options.metricConfig: optional — omit for plain execution count. To aggregate a fact, pass
          { "targetVariable": "<fact>", "aggregationType": "COUNT" | "SUM" | "AVG" }

        Example (uploaded dataset):
        {
          "policyVersionId": "<uuid>",
          "dataset": { "type": "UPLOADED", "source": "S3_BUCKET", "path": "<path from lexq_dataset_upload>" },
          "options": { "baselinePolicyVersionId": "<uuid>", "includeRuleStats": true, "maxRecords": 10000 }
        }

        Example (historical):
        {
          "policyVersionId": "<uuid>",
          "dataset": { "type": "HISTORICAL", "source": "EXECUTION_LOGS", "from": "2026-01-01", "to": "2026-01-31" },
          "options": { "baselinePolicyVersionId": "<uuid>", "includeRuleStats": true }
        }
      `,
      inputSchema: {
        body: z.string().describe('JSON string of SimulationRequest'),
      },
    },
    async ({ body }) => {
      const parsed: unknown = JSON.parse(body);
      return callApi('POST', 'analytics/simulations', { body: parsed });
    },
  );

  server.registerTool(
    'lexq_simulation_status',
    {
      title: 'Simulation Status',
      description: 'Get simulation status and results. Poll until status is COMPLETED or FAILED.',
      inputSchema: {
        simulationId: z.string().uuid().describe('Simulation ID'),
      },
    },
    async ({ simulationId }) => callApi('GET', `analytics/simulations/${simulationId}`),
  );

  server.registerTool(
    'lexq_simulation_list',
    {
      title: 'List Simulations',
      description: 'List simulation history with optional filters.',
      inputSchema: {
        page: z.number().int().min(0).default(0).describe('Page number'),
        size: z.number().int().min(1).max(100).default(20).describe('Page size'),
        status: z
          .enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELED'])
          .optional()
          .describe('Filter by status'),
        from: z.string().optional().describe('Start date (yyyy-MM-dd)'),
        to: z.string().optional().describe('End date (yyyy-MM-dd)'),
      },
    },
    async ({ page, size, status, from, to }) => {
      const params: Record<string, string> = paginationParams(page, size);
      if (status) params.status = status;
      if (from) params.from = from;
      if (to) params.to = to;
      return callApi('GET', 'analytics/simulations', { params });
    },
  );

  server.registerTool(
    'lexq_simulation_cancel',
    {
      title: 'Cancel Simulation',
      description: 'Cancel a running or pending simulation.',
      inputSchema: {
        simulationId: z.string().uuid().describe('Simulation ID'),
      },
    },
    async ({ simulationId }) => callApi('DELETE', `analytics/simulations/${simulationId}`),
  );

  server.registerTool(
    'lexq_simulation_export',
    {
      title: 'Export Simulation',
      description: 'Export simulation results as JSON or CSV. Returns the raw data.',
      inputSchema: {
        simulationId: z.string().uuid().describe('Simulation ID'),
        format: z.enum(['json', 'csv']).default('json').describe('Export format'),
      },
    },
    async ({ simulationId, format }) =>
      callApi('GET', `analytics/simulations/${simulationId}/export`, {
        params: { format },
      }),
  );

  // ── Dataset Upload ──

  server.registerTool(
    'lexq_dataset_upload',
    {
      title: 'Upload Dataset',
      description: dedent`
        Upload inline CSV or JSON content as a simulation dataset.
        The content is uploaded to S3 and a path is returned in the "path" field.

        To use the returned path in lexq_simulation_start, set:
          dataset: { "type": "UPLOADED", "source": "S3_BUCKET", "path": "<returned path>" }

        CSV example:
        user_id,payment_amount
        user_001,150000
        user_002,50000

        JSON example: [{"user_id":"user_001","payment_amount":150000}, {"user_id":"user_002","payment_amount":50000}]
      `,
      inputSchema: {
        content: z.string().describe('CSV or JSON content as string'),
        filename: z
          .string()
          .default('dataset.csv')
          .describe('Filename with extension (.csv or .json)'),
      },
    },
    async ({ content, filename }) => {
      const result = await callApi('POST', 'analytics/datasets/upload', {
        upload: { content, filename, fieldName: 'file' },
      });

      if (!result.isError) {
        try {
          const uploaded = JSON.parse(result.content[0]?.text ?? '{}') as { path?: string };
          if (uploaded.path) {
            const dataset = { type: 'UPLOADED', source: 'S3_BUCKET', path: uploaded.path };
            result.content.push({
              type: 'text',
              text:
                'Ready-to-use dataset block for lexq_simulation_start:\n' +
                JSON.stringify({ dataset }, null, 2),
            });
          }
        } catch {
          // path 추출 실패는 무시 — 업로드 원본 응답은 그대로 반환된다.
        }
      }

      return result;
    },
  );

  // ── Dataset Template ──

  server.registerTool(
    'lexq_dataset_template',
    {
      title: 'Download Dataset Template',
      description:
        'Generate a sample CSV or JSON template based on the required facts of a version. Use this to understand the expected data format before uploading a dataset.',
      inputSchema: {
        groupId: z.string().uuid().describe('Policy group ID'),
        versionId: z.string().uuid().describe('Version ID'),
        format: z.enum(['csv', 'json']).default('csv').describe('Template format'),
      },
    },
    async ({ groupId, versionId, format }) =>
      callApi('GET', `analytics/groups/${groupId}/versions/${versionId}/dataset-template`, {
        params: { format },
      }),
  );
}
