import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CallApi } from './_shared';
import { paginationParams } from './_shared';

export function registerDeployTools(server: McpServer, callApi: CallApi): void {
  server.registerTool(
    'lexq_deploy_publish',
    {
      title: 'Publish Version',
      description:
        'Publish a DRAFT version (DRAFT → ACTIVE). Locks the version from further edits. Must have at least one rule.',
      inputSchema: {
        groupId: z.string().uuid().describe('Policy group ID'),
        versionId: z.string().uuid().describe('Version ID to publish'),
        memo: z.string().min(1).describe('Publish memo (required)'),
      },
    },
    async ({ groupId, versionId, memo }) =>
      callApi('POST', `policy-groups/${groupId}/versions/${versionId}/publish`, { body: { memo } }),
  );

  server.registerTool(
    'lexq_deploy_live',
    {
      title: 'Deploy to Live',
      description:
        'Deploy an ACTIVE (published) version to live traffic. Takes effect immediately.',
      inputSchema: {
        groupId: z.string().uuid().describe('Policy group ID'),
        versionId: z.string().uuid().describe('Version ID to deploy'),
        memo: z.string().min(1).describe('Deployment memo (required)'),
      },
    },
    async ({ groupId, versionId, memo }) =>
      callApi('POST', `policy-groups/${groupId}/deploy`, {
        body: { versionId, memo },
      }),
  );

  server.registerTool(
    'lexq_deploy_rollback',
    {
      title: 'Rollback Deployment',
      description:
        'Rollback to the previous deployed version. Only available if there is a previous version.',
      inputSchema: {
        groupId: z.string().uuid().describe('Policy group ID'),
        memo: z.string().min(1).describe('Rollback reason (required)'),
      },
    },
    async ({ groupId, memo }) =>
      callApi('POST', `policy-groups/${groupId}/rollback`, {
        body: { memo },
      }),
  );

  server.registerTool(
    'lexq_deploy_undeploy',
    {
      title: 'Undeploy',
      description:
        'Remove the live version from traffic. The version stays ACTIVE but no longer serves requests.',
      inputSchema: {
        groupId: z.string().uuid().describe('Policy group ID'),
        memo: z.string().min(1).describe('Undeploy reason (required)'),
      },
    },
    async ({ groupId, memo }) =>
      callApi('POST', `policy-groups/${groupId}/undeploy`, {
        body: { memo },
      }),
  );

  server.registerTool(
    'lexq_deploy_history',
    {
      title: 'Deployment History',
      description: 'List deployment history across all groups.',
      inputSchema: {
        page: z.number().int().min(0).default(0).describe('Page number'),
        size: z.number().int().min(1).max(100).default(20).describe('Page size'),
        groupId: z.string().uuid().optional().describe('Filter by group ID'),
        types: z
          .string()
          .optional()
          .describe(
            'Filter by deployment types (comma-separated: PUBLISH,DEPLOY,ROLLBACK,UNDEPLOY)',
          ),
        startDate: z.string().optional().describe('Start date (yyyy-MM-dd)'),
        endDate: z.string().optional().describe('End date (yyyy-MM-dd)'),
      },
    },
    async ({ page, size, groupId, types, startDate, endDate }) => {
      const params: Record<string, string> = paginationParams(page, size);
      if (groupId) params.groupId = groupId;
      if (types) params.types = types;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      return callApi('GET', 'deployments', { params });
    },
  );

  server.registerTool(
    'lexq_deploy_detail',
    {
      title: 'Deployment Detail',
      description:
        'Get detailed info about a specific deployment including snapshot hash and integrity check.',
      inputSchema: {
        deploymentId: z.string().uuid().describe('Deployment ID'),
      },
    },
    async ({ deploymentId }) => callApi('GET', `deployments/${deploymentId}`),
  );

  server.registerTool(
    'lexq_deploy_overview',
    {
      title: 'Deployment Overview',
      description:
        'Show current deployment status of all groups — which version is live, last deployment type, and deployer.',
      inputSchema: {},
    },
    async () => callApi('GET', 'deployments/overview'),
  );

  server.registerTool(
    'lexq_deploy_deployable',
    {
      title: 'List Deployable Versions',
      description:
        'List ACTIVE (published) versions that can be deployed for a group. Use this to find which versions are available before calling deploy live.',
      inputSchema: {
        groupId: z.string().uuid().describe('Policy group ID'),
      },
    },
    async ({ groupId }) => callApi('GET', `deployments/groups/${groupId}/deployable-versions`),
  );

  server.registerTool(
    'lexq_deploy_diff',
    {
      title: 'Deployment Diff',
      description:
        'Compare rule snapshots between two versions. Shows added, removed, and modified rules. Useful for reviewing changes before deploying a new version.',
      inputSchema: {
        baseVersionId: z.string().uuid().describe('Base version ID (typically the current live)'),
        targetVersionId: z
          .string()
          .uuid()
          .describe('Target version ID (the one you want to deploy)'),
      },
    },
    async ({ baseVersionId, targetVersionId }) =>
      callApi('GET', 'deployments/diff', {
        params: { baseVersionId, targetVersionId },
      }),
  );
}
