import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callApi, paginationParams } from './_shared';

export function registerAnalyticsTools(server: McpServer): void {
    // ── Dry Run ──

    server.registerTool(
        'lexq_dry_run',
        {
            title: 'Dry Run',
            description: `Execute a single dry run against a version. Tests how rules evaluate given input facts without side effects.

Example input: { "facts": { "payment_amount": 100000, "customer_tier": "VIP" } }

Always dry-run before publishing to validate rule behavior.`,
            inputSchema: {
                versionId: z.string().uuid().describe('Policy version ID to test against'),
                facts: z
                    .string()
                    .describe('JSON string of facts object, e.g. {"payment_amount":100000}'),
                includeDebugInfo: z
                    .boolean()
                    .default(true)
                    .describe('Include execution and decision traces'),
                mockExternalCalls: z
                    .boolean()
                    .default(true)
                    .describe('Mock external integration calls'),
            },
        },
        async ({ versionId, facts, includeDebugInfo, mockExternalCalls }) => {
            const parsedFacts: unknown = JSON.parse(facts);
            return callApi('POST', `analytics/dry-run/versions/${versionId}`, {
                body: { facts: parsedFacts, includeDebugInfo, mockExternalCalls },
            });
        }
    );

    // ── Dry Run Compare ──

    server.registerTool(
        'lexq_dry_run_compare',
        {
            title: 'Dry Run Compare',
            description:
                'Compare dry run results between two versions using the same input facts. Useful for validating changes.',
            inputSchema: {
                versionIdA: z.string().uuid().describe('Baseline version ID'),
                versionIdB: z.string().uuid().describe('Candidate version ID'),
                facts: z
                    .string()
                    .describe('JSON string of facts object'),
            },
        },
        async ({ versionIdA, versionIdB, facts }) => {
            const parsedFacts: unknown = JSON.parse(facts);
            return callApi('POST', 'analytics/dry-run/compare', {
                body: { versionIdA, versionIdB, facts: parsedFacts },
            });
        }
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
            callApi(
                'GET',
                `analytics/groups/${groupId}/versions/${versionId}/requirements`
            )
    );

    // ── Simulation ──

    server.registerTool(
        'lexq_simulation_start',
        {
            title: 'Start Simulation',
            description: `Start a batch simulation against historical execution data.

Example body:
{
  "policyVersionId": "<uuid>",
  "dataset": { "type": "HISTORICAL", "source": "EXECUTION_LOGS", "from": "2025-01-01", "to": "2025-01-31" },
  "options": { "baselinePolicyVersionId": "<uuid>", "includeRuleStats": true, "maxRecords": 10000 }
}`,
            inputSchema: {
                body: z
                    .string()
                    .describe('JSON string of SimulationRequest'),
            },
        },
        async ({ body }) => {
            const parsed: unknown = JSON.parse(body);
            return callApi('POST', 'analytics/simulations', { body: parsed });
        }
    );

    server.registerTool(
        'lexq_simulation_status',
        {
            title: 'Simulation Status',
            description:
                'Get simulation status and results. Poll until status is COMPLETED or FAILED.',
            inputSchema: {
                simulationId: z.string().uuid().describe('Simulation ID'),
            },
        },
        async ({ simulationId }) =>
            callApi('GET', `analytics/simulations/${simulationId}`)
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
                    .enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'])
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
        }
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
        async ({ simulationId }) =>
            callApi('DELETE', `analytics/simulations/${simulationId}`)
    );

    server.registerTool(
        'lexq_simulation_export',
        {
            title: 'Export Simulation',
            description:
                'Export simulation results as JSON or CSV. Returns the raw data.',
            inputSchema: {
                simulationId: z.string().uuid().describe('Simulation ID'),
                format: z
                    .enum(['json', 'csv'])
                    .default('json')
                    .describe('Export format'),
            },
        },
        async ({ simulationId, format }) =>
            callApi('GET', `analytics/simulations/${simulationId}/export`, {
                params: { format },
            })
    );
}