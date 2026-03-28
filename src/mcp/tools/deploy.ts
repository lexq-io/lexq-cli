import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callApi, paginationParams } from './_shared';

export function registerDeployTools(server: McpServer): void {
    server.registerTool(
        'lexq_deploy_publish',
        {
            title: 'Publish Version',
            description:
                'Publish a DRAFT version (DRAFT → ACTIVE). Locks the version from further edits. Must have at least one rule.',
            inputSchema: {
                groupId: z.string().uuid().describe('Policy group ID'),
                versionId: z.string().uuid().describe('Version ID to publish'),
                memo: z.string().default('').describe('Deployment memo'),
            },
        },
        async ({ groupId, versionId, memo }) =>
            callApi(
                'POST',
                `policy-groups/${groupId}/versions/${versionId}/publish`,
                { body: { memo } }
            )
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
                memo: z.string().default('').describe('Deployment memo'),
            },
        },
        async ({ groupId, versionId, memo }) =>
            callApi('POST', `policy-groups/${groupId}/deploy`, {
                body: { versionId, memo },
            })
    );

    server.registerTool(
        'lexq_deploy_rollback',
        {
            title: 'Rollback Deployment',
            description:
                'Rollback to the previous deployed version. Only available if there is a previous version.',
            inputSchema: {
                groupId: z.string().uuid().describe('Policy group ID'),
                memo: z.string().default('').describe('Rollback reason'),
            },
        },
        async ({ groupId, memo }) =>
            callApi('POST', `policy-groups/${groupId}/rollback`, {
                body: { memo },
            })
    );

    server.registerTool(
        'lexq_deploy_undeploy',
        {
            title: 'Undeploy',
            description:
                'Remove the live version from traffic. The version stays ACTIVE but no longer serves requests.',
            inputSchema: {
                groupId: z.string().uuid().describe('Policy group ID'),
                memo: z.string().default('').describe('Undeploy reason'),
            },
        },
        async ({ groupId, memo }) =>
            callApi('POST', `policy-groups/${groupId}/undeploy`, {
                body: { memo },
            })
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
                type: z
                    .enum(['PUBLISH', 'DEPLOY', 'ROLLBACK', 'UNDEPLOY'])
                    .optional()
                    .describe('Filter by deployment type'),
            },
        },
        async ({ page, size, groupId, type }) => {
            const params: Record<string, string> = paginationParams(page, size);
            if (groupId) params.groupId = groupId;
            if (type) params.type = type;
            return callApi('GET', 'deployments', { params });
        }
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
        async ({ deploymentId }) =>
            callApi('GET', `deployments/${deploymentId}`)
    );

    server.registerTool(
        'lexq_deploy_overview',
        {
            title: 'Deployment Overview',
            description:
                'Show current deployment status of all groups — which version is live, last deployment type, and deployer.',
            inputSchema: {},
        },
        async () => callApi('GET', 'deployments/overview')
    );
}