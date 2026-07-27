import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import dedent from 'dedent';
import type { CallApi } from './_shared';

// Condition/Action are deeply nested JSON — accept as opaque object via z.record.
// The engine validates structure. MCP schema describes the shape in descriptions.

export function registerRuleTools(server: McpServer, callApi: CallApi): void {
  server.registerTool(
    'lexq_rules_list',
    {
      title: 'List Rules',
      description:
        'List all rules in a version (priority ASC). Returns summary with conditionSummary and actionSummary.',
      inputSchema: {
        groupId: z.string().uuid().describe('Policy group ID'),
        versionId: z.string().uuid().describe('Version ID'),
      },
    },
    async ({ groupId, versionId }) =>
      callApi('GET', `policy-groups/${groupId}/versions/${versionId}/rules`),
  );

  server.registerTool(
    'lexq_rules_get',
    {
      title: 'Get Rule Detail',
      description: 'Get full rule detail including condition tree and action definitions.',
      inputSchema: {
        groupId: z.string().uuid().describe('Policy group ID'),
        versionId: z.string().uuid().describe('Version ID'),
        ruleId: z.string().uuid().describe('Rule ID'),
      },
    },
    async ({ groupId, versionId, ruleId }) =>
      callApi('GET', `policy-groups/${groupId}/versions/${versionId}/rules/${ruleId}`),
  );

  server.registerTool(
    'lexq_rules_create',
    {
      title: 'Create Rule',
      description: dedent`
        Create a rule in a DRAFT version. Requires name, condition tree, and actions array. priority is auto-assigned (appended last); use lexq_rules_reorder to change order.

        Before creating rules with new fact keys, call lexq_facts_list to check existing facts.
        If a required key is missing, ask the user to confirm the type, isRequired, and description
        before calling lexq_facts_create — registering facts enables type validation, Console UI
        autocomplete, and the dry-run requirements analyzer.
        
        After saving, lexq_facts_unregistered lists any keys this version references but has not
        defined (non-blocking, version-wide) — use it to decide what to register.

        Condition: { type: "SINGLE", field, operator, value, valueType } or { type: "GROUP", operator: "AND"|"OR", children: [...] }
        Value types: STRING, NUMBER, BOOLEAN, LIST_STRING, LIST_NUMBER
        
        Operators are constrained by the LEFT fact's type (from lexq_facts_list). Using one outside
        its type is rejected by the server — check the fact type before choosing an operator.
        - STRING fact:       EQUALS, NOT_EQUALS, CONTAINS, IN, NOT_IN
        - NUMBER fact:       EQUALS, NOT_EQUALS, GREATER_THAN, GREATER_THAN_OR_EQUAL, LESS_THAN, LESS_THAN_OR_EQUAL, IN, NOT_IN
        - BOOLEAN fact:      EQUALS, NOT_EQUALS
        - LIST_* fact:       HAS_ANY, HAS_ALL, HAS_NONE (only these)

        HAS_* query list-typed facts. Value is always an array whose element type matches the fact:
        - HAS_ANY: fact has at least one of the given values
        - HAS_ALL: fact has all of the given values
        - HAS_NONE: fact has none of the given values
        Example: { "type": "SINGLE", "field": "user_tags", "operator": "HAS_ANY", "value": ["VIP","GOLD"], "valueType": "LIST_STRING" }

        Do NOT use CONTAINS on a list fact — CONTAINS is substring match on STRING facts only.
        IN is the mirror of HAS_*: IN takes a scalar fact with a list value; HAS_* takes lists on both sides.

        Actions: [{ type, parameters }]

        Action parameter schemas:
        - MUTATE_FACT: { refVar: string, operator: "ASSIGN"|"ADD"|"SUB"|"MUL"|"DIV", method: "PERCENTAGE"|"AMOUNT", rate?: number (when PERCENTAGE), value?: number (when AMOUNT), rounding?: RoundingOption } Constraints: DIV + PERCENTAGE is invalid (use MUL with rate/100 inverse). DIV + AMOUNT requires value !== 0.
        - INCREMENT_FACT: { targetVar: string, method: "PERCENTAGE"|"AMOUNT", refVar?: string (required when PERCENTAGE), rate?: number (when PERCENTAGE), value?: number (when AMOUNT), rounding?: RoundingOption } targetVar (accumulation target) must exist at execution; refVar (PERCENTAGE source) must exist when method is PERCENTAGE. Each is supplied as an input fact or written by a prior action in this rule — a missing required fact throws (no 0 default). Note: external system call (e.g. point system sync) is NOT a primitive responsibility. Compose [INCREMENT_FACT, EMIT_EVENT] chain instead.
        - EMIT_EVENT: { integrationId: uuid, eventPayload: object (Map<string,unknown>, ≥1 entry) } eventPayload is passed through to the integration provider as-is. Domain-specific keys (couponId, ticketId, etc.) are routed by the provider, not validated by the engine.
        - BLOCK: { reason: string }
        - EMIT_NOTIFICATION: { integrationId: uuid, targetVar: string, notificationPayload: object (Map<string,unknown>, ≥1 entry) } targetVar identifies the recipient fact (e.g. phone_number / email / device_token) and is REQUIRED — the named fact must be present in the request or the action throws. (Contrast with ADD_TAG, where targetVar is an optional write target that is created if absent.)
        - EMIT_WEBHOOK: { url: string, method: "POST", payloadTemplate?: object } payloadTemplate is optional. Without it, all facts are sent as-is. With it, the object is sent as the HTTP body with {{variables}} replaced at execution time. Variables: {{fact.xxx}}, {{output.xxx}}, {{timestamp}}, {{ruleName}}, {{groupName}}, {{versionNo}}, {{xxx}} (shorthand).
          Platform examples:
            Slack: { "text": "Rule {{ruleName}} fired — {{fact.customer_tier}}" }
            Discord: { "content": "Rule {{ruleName}} fired — {{fact.customer_tier}}" }
            Generic: { "event": "rule_matched", "rule": "{{ruleName}}", "amount": "{{output.payment_amount}}" }
        - SET_FACT: { key: string, value: string|number|boolean }
        - ADD_TAG: { tag: string, targetVar?: string (defaults to "user_tags") } Appends tag to a LIST_STRING fact, creating it if absent. Adding an existing tag is a no-op (idempotent). Read tags back with HAS_ANY / HAS_ALL / HAS_NONE.
        
        RoundingOption (optional, MUTATE_FACT / INCREMENT_FACT only): { scale: integer (0..16), mode?: "HALF_UP"|"HALF_DOWN"|"HALF_EVEN"|"FLOOR"|"CEILING"|"DOWN"|"UP" } mode defaults to HALF_UP. When omitted, calculator output is preserved at full precision (lossless).
      `,
      inputSchema: {
        groupId: z.string().uuid().describe('Policy group ID'),
        versionId: z.string().uuid().describe('Version ID'),
        rule: z
          .string()
          .describe(
            'JSON string of CreateRuleRequest: { name, condition, actions, mutexGroup?, mutexMode?, mutexStrategy?, mutexLimit?, isEnabled? }',
          ),
      },
    },
    async ({ groupId, versionId, rule }) => {
      const body: unknown = JSON.parse(rule);
      return callApi('POST', `policy-groups/${groupId}/versions/${versionId}/rules`, { body });
    },
  );

  server.registerTool(
    'lexq_rules_update',
    {
      title: 'Update Rule',
      description: 'Update an existing rule in a DRAFT version. Only provided fields are changed.',
      inputSchema: {
        groupId: z.string().uuid().describe('Policy group ID'),
        versionId: z.string().uuid().describe('Version ID'),
        ruleId: z.string().uuid().describe('Rule ID'),
        rule: z
          .string()
          .describe(
            'JSON string of UpdateRuleRequest: { name?, condition?, actions?, mutexGroup?, mutexMode?, mutexStrategy?, mutexLimit?, isEnabled? }',
          ),
      },
    },
    async ({ groupId, versionId, ruleId, rule }) => {
      const body: unknown = JSON.parse(rule);
      return callApi('PUT', `policy-groups/${groupId}/versions/${versionId}/rules/${ruleId}`, {
        body,
      });
    },
  );

  server.registerTool(
    'lexq_rules_delete',
    {
      title: 'Delete Rule',
      description: 'Delete a rule from a DRAFT version.',
      inputSchema: {
        groupId: z.string().uuid().describe('Policy group ID'),
        versionId: z.string().uuid().describe('Version ID'),
        ruleId: z.string().uuid().describe('Rule ID'),
        force: z
          .boolean()
          .default(false)
          .describe('Skip confirmation (for the last rule in a version)'),
      },
    },
    async ({ groupId, versionId, ruleId, force }) => {
      const params: Record<string, string> = {};
      if (force) params.force = 'true';
      return callApi('DELETE', `policy-groups/${groupId}/versions/${versionId}/rules/${ruleId}`, {
        params,
      });
    },
  );

  server.registerTool(
    'lexq_rules_reorder',
    {
      title: 'Reorder Rules',
      description:
        'Reorder rules by specifying rule IDs in desired order. Priorities are assigned 1...N (1-based, continuous); array index 0 = priority 1 (highest precedence).',
      inputSchema: {
        groupId: z.string().uuid().describe('Policy group ID'),
        versionId: z.string().uuid().describe('Version ID'),
        ruleIds: z.array(z.string().uuid()).describe('Rule IDs in desired priority order'),
      },
    },
    async ({ groupId, versionId, ruleIds }) => {
      const rules = ruleIds.map((ruleId: string, index: number) => ({
        ruleId,
        priority: index + 1,
      }));
      return callApi('PATCH', `policy-groups/${groupId}/versions/${versionId}/rules/reorder`, {
        body: { rules },
      });
    },
  );

  server.registerTool(
    'lexq_rules_toggle',
    {
      title: 'Toggle Rule',
      description: 'Enable or disable a rule without deleting it.',
      inputSchema: {
        groupId: z.string().uuid().describe('Policy group ID'),
        versionId: z.string().uuid().describe('Version ID'),
        ruleId: z.string().uuid().describe('Rule ID'),
        isEnabled: z.boolean().describe('true to enable, false to disable'),
      },
    },
    async ({ groupId, versionId, ruleId, isEnabled }) =>
      callApi('PATCH', `policy-groups/${groupId}/versions/${versionId}/rules/${ruleId}/enabled`, {
        body: { isEnabled },
      }),
  );
}
