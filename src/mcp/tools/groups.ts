import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { CallApi } from './_shared';
import { ConflictResolutionMode, ConflictResolutionStrategy } from '@/types/enums';
import { MAX_GROUPS_PER_TENANT } from '@/types/constants';

export function registerGroupTools(server: McpServer, callApi: CallApi): void {
  // ── CRUD ──

  server.registerTool(
    'lexq_groups_list',
    {
      title: 'List Policy Groups',
      annotations: { readOnlyHint: true },
      description:
        'List policy groups (tenant-wide, priority ASC). Deleted groups are not included.',
      inputSchema: z.object({}),
    },
    async () => callApi('GET', 'policy-groups'),
  );

  server.registerTool(
    'lexq_groups_get',
    {
      title: 'Get Policy Group',
      annotations: { readOnlyHint: true },
      description:
        'Get a single policy group by ID. Its currentVersionId and currentDeploymentId are what lexq_deploy_rollback expects, and previousVersionName is the version a rollback restores.',
      inputSchema: z.object({
        groupId: z.string().uuid().describe('Policy group ID'),
      }),
    },
    async ({ groupId }) => callApi('GET', `policy-groups/${groupId}`),
  );

  server.registerTool(
    'lexq_groups_create',
    {
      title: 'Create Policy Group',
      annotations: { readOnlyHint: false, destructiveHint: false },
      description: `Create a new policy group. Requires name. Priority is auto-assigned (appended last, tenant-wide); use lexq_groups_reorder to change order. Optionally set conflict resolution, activation group, and description. Policy groups that share an activationGroup form a cluster and must share the same activationMode / activationStrategy / executionLimit; executionLimit is how many of those groups run, not how many rules. A tenant can have at most ${MAX_GROUPS_PER_TENANT} groups that are not ARCHIVED; archive groups you no longer use to free a slot.`,
      inputSchema: z.object({
        name: z.string().describe('Group name (unique among non-ARCHIVED)'),
        description: z.string().optional().describe('Group description'),
        activationMode: z
          .enum(ConflictResolutionMode)
          .optional()
          .describe('Conflict resolution mode'),
        activationStrategy: z
          .enum(ConflictResolutionStrategy)
          .optional()
          .describe('Ranking used to pick the winning groups when mode is EXCLUSIVE or MAX_N'),
        executionLimit: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe(
            'How many policy groups sharing this activationGroup may run (required when mode is MAX_N). Counts groups, not rules: every rule of a winning group runs.',
          ),
        activationGroup: z
          .string()
          .optional()
          .describe(
            'Activation group (Execution Group) cluster key. Policy groups sharing this key compete, and group priority picks the winners.',
          ),
      }),
    },
    async (args) => {
      const body: Record<string, unknown> = {
        name: args.name,
      };
      if (args.description !== undefined) body.description = args.description;
      if (args.activationMode !== undefined) body.activationMode = args.activationMode;
      if (args.activationStrategy !== undefined) body.activationStrategy = args.activationStrategy;
      if (args.executionLimit !== undefined) body.executionLimit = args.executionLimit;
      if (args.activationGroup !== undefined) body.activationGroup = args.activationGroup;
      return callApi('POST', 'policy-groups', { body });
    },
  );

  server.registerTool(
    'lexq_groups_update',
    {
      title: 'Update Policy Group',
      annotations: { readOnlyHint: false, destructiveHint: true },
      description:
        'Update a policy group. Only provided fields are updated; omitted fields remain unchanged. A deleted group cannot be updated (409 P-059).',
      inputSchema: z.object({
        groupId: z.string().uuid().describe('Policy group ID'),
        name: z.string().optional().describe('New name'),
        description: z.string().optional().describe('New description'),
        status: z
          .enum(['ACTIVE', 'DISABLED'])
          .optional()
          .describe(
            'DISABLED stops production execution of this group: execution calls return 403 (P-009), and a composite call that includes the group is rejected in full. The deployed version and any A/B test are kept, and dry run, Impact Simulation, and Decision Replay keep working, so a fix can be verified before setting ACTIVE again. To go back to the previous version, use lexq_deploy_rollback. To take the version out of production, use lexq_deploy_undeploy.',
          ),
        activationGroup: z
          .string()
          .optional()
          .describe(
            'Activation group (Execution Group) cluster key. Policy groups sharing this key compete, and group priority picks the winners.',
          ),
        activationMode: z
          .enum(ConflictResolutionMode)
          .optional()
          .describe('Conflict resolution mode'),
        activationStrategy: z
          .enum(ConflictResolutionStrategy)
          .optional()
          .describe('Ranking used to pick the winning groups'),
        executionLimit: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe(
            'How many policy groups sharing this activationGroup may run. Counts groups, not rules.',
          ),
      }),
    },
    async ({ groupId, ...body }) => callApi('PUT', `policy-groups/${groupId}`, { body }),
  );

  server.registerTool(
    'lexq_groups_delete',
    {
      title: 'Delete Policy Group',
      annotations: { readOnlyHint: false, destructiveHint: true },
      description:
        'Delete (archive) a policy group. A deployed group cannot be deleted (P-020); undeploy it first with lexq_deploy_undeploy, which also ends a running A/B test. This cannot be undone. The group no longer appears in lexq_groups_list and its name can be reused right away. Calls that change it (settings, versions, rules, starting an A/B test, publish, deploy, rollback, scheduling a deployment) return 409 P-059. If it was ever executed, deployed, or replayed, it is kept for audit; otherwise it is permanently deleted after 30 days.',
      inputSchema: z.object({
        groupId: z.string().uuid().describe('Policy group ID'),
      }),
    },
    async ({ groupId }) => callApi('DELETE', `policy-groups/${groupId}`),
  );

  server.registerTool(
    'lexq_groups_reorder',
    {
      title: 'Reorder Policy Groups',
      annotations: { readOnlyHint: false, destructiveHint: true },
      description:
        'Reorder policy groups by priority. Priority is tenant-wide and flat (1...N continuous); array index 0 = priority 1 (highest precedence). activationGroup is not affected — this only changes priority.',
      inputSchema: z.object({
        groupIds: z
          .array(z.string().uuid())
          .describe('Group IDs in desired priority order (index 0 = priority 1)'),
      }),
    },
    async ({ groupIds }) => {
      const groups = groupIds.map((groupId: string, index: number) => ({
        groupId,
        priority: index + 1,
      }));
      return callApi('PATCH', 'policy-groups/reorder', { body: { groups } });
    },
  );

  // ── A/B Test ──

  server.registerTool(
    'lexq_ab_test_start',
    {
      title: 'Start A/B Test',
      annotations: { readOnlyHint: false, destructiveHint: false },
      description:
        'Start an A/B test on a policy group. Requires a challenger version ID and traffic rate. ' +
        'The challenger must be a published version of the same group; a version from another ' +
        'group is rejected with P-016. ' +
        'The split is computed from context.trafficKey on each execution request; requests that ' +
        'omit it never reach the challenger and the test stays at 0%.',
      inputSchema: z.object({
        groupId: z.string().uuid().describe('Policy group ID'),
        testVersionId: z
          .string()
          .uuid()
          .describe('Challenger version ID. Must be a published version of this group'),
        trafficRate: z
          .number()
          .int()
          .min(1)
          .max(99)
          .describe('Traffic percentage routed to challenger (1-99)'),
      }),
    },
    async ({ groupId, ...body }) => callApi('POST', `policy-groups/${groupId}/ab-test`, { body }),
  );

  server.registerTool(
    'lexq_ab_test_stop',
    {
      title: 'Stop A/B Test',
      annotations: { readOnlyHint: false, destructiveHint: true },
      description:
        'Stop a running A/B test. All traffic is restored to the control (current) version.',
      inputSchema: z.object({
        groupId: z.string().uuid().describe('Policy group ID'),
      }),
    },
    async ({ groupId }) => callApi('DELETE', `policy-groups/${groupId}/ab-test`),
  );

  server.registerTool(
    'lexq_ab_test_adjust',
    {
      title: 'Adjust A/B Test',
      annotations: { readOnlyHint: false, destructiveHint: true },
      description: 'Adjust traffic rate of a running A/B test.',
      inputSchema: z.object({
        groupId: z.string().uuid().describe('Policy group ID'),
        trafficRate: z
          .number()
          .int()
          .min(1)
          .max(99)
          .describe('New traffic percentage for challenger (1-99)'),
      }),
    },
    async ({ groupId, ...body }) =>
      callApi('PATCH', `policy-groups/${groupId}/ab-test/traffic-rate`, { body }),
  );
}
