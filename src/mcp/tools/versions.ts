import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CallApi } from './_shared';
import { paginationParams } from './_shared';

export function registerVersionTools(server: McpServer, callApi: CallApi): void {
  server.registerTool(
    'lexq_versions_list',
    {
      title: 'List Policy Versions',
      description: 'List all versions of a policy group.',
      inputSchema: {
        groupId: z.string().uuid().describe('Policy group ID'),
        page: z.number().int().min(0).default(0).describe('Page number'),
        size: z.number().int().min(1).max(100).default(20).describe('Page size'),
      },
    },
    async ({ groupId, page, size }) =>
      callApi('GET', `policy-groups/${groupId}/versions`, {
        params: paginationParams(page, size),
      }),
  );

  server.registerTool(
    'lexq_versions_get',
    {
      title: 'Get Policy Version',
      description: 'Get a single version by ID, including its rules and fact requirements.',
      inputSchema: {
        groupId: z.string().uuid().describe('Policy group ID'),
        versionId: z.string().uuid().describe('Version ID'),
      },
    },
    async ({ groupId, versionId }) =>
      callApi('GET', `policy-groups/${groupId}/versions/${versionId}`),
  );

  server.registerTool(
    'lexq_versions_create',
    {
      title: 'Create Policy Version',
      description:
        'Create a new DRAFT version in a policy group. Provide a commit message and optional effective date range.',
      inputSchema: {
        groupId: z.string().uuid().describe('Policy group ID'),
        commitMessage: z.string().describe('Commit message describing this version'),
        effectiveFrom: z.string().optional().describe('Effective start date (ISO 8601)'),
        effectiveTo: z.string().optional().describe('Effective end date (ISO 8601)'),
      },
    },
    async ({ groupId, ...body }) => callApi('POST', `policy-groups/${groupId}/versions`, { body }),
  );

  server.registerTool(
    'lexq_versions_update',
    {
      title: 'Update Policy Version',
      description: 'Update a DRAFT version. Only DRAFT versions can be modified.',
      inputSchema: {
        groupId: z.string().uuid().describe('Policy group ID'),
        versionId: z.string().uuid().describe('Version ID'),
        commitMessage: z.string().optional().describe('New commit message'),
        effectiveFrom: z.string().optional().describe('New effective start date'),
        effectiveTo: z.string().optional().describe('New effective end date'),
      },
    },
    async ({ groupId, versionId, ...body }) =>
      callApi('PUT', `policy-groups/${groupId}/versions/${versionId}`, { body }),
  );

  server.registerTool(
    'lexq_versions_delete',
    {
      title: 'Delete Policy Version',
      description: 'Delete a DRAFT version. Only DRAFT versions can be deleted.',
      inputSchema: {
        groupId: z.string().uuid().describe('Policy group ID'),
        versionId: z.string().uuid().describe('Version ID'),
      },
    },
    async ({ groupId, versionId }) =>
      callApi('DELETE', `policy-groups/${groupId}/versions/${versionId}`),
  );

  server.registerTool(
    'lexq_versions_clone',
    {
      title: 'Clone Policy Version',
      description:
        'Clone an existing version to create a new DRAFT. Useful when the source version is already published.',
      inputSchema: {
        groupId: z.string().uuid().describe('Policy group ID'),
        versionId: z.string().uuid().describe('Source version ID to clone'),
      },
    },
    async ({ groupId, versionId }) => {
      return callApi('POST', `policy-groups/${groupId}/versions/${versionId}/clone`, {
        body: {},
      });
    },
  );
}
