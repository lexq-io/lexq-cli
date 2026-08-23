import { MAX_ROUNDING_SCALE } from '@/types/constants';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import dedent from 'dedent';
import type { CallApi } from './_shared';
import { parseJson } from '@/lib/lossless-json';

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
        Example: { "type": "SINGLE", "field": "userTags", "operator": "HAS_ANY", "value": ["VIP","GOLD"], "valueType": "LIST_STRING" }

        Do NOT use CONTAINS on a list fact — CONTAINS is substring match on STRING facts only.
        IN is the mirror of HAS_*: IN takes a scalar fact with a list value; HAS_* takes lists on both sides.

        Actions: [{ type, parameters }]

        Action parameter schemas:
        - MUTATE_FACT: { targetVar: string, operator: "ASSIGN"|"ADD"|"SUB"|"MUL"|"DIV", method: "PERCENTAGE"|"AMOUNT", operand: number, refVar?: string, rounding?: RoundingOption }
          targetVar is the fact this action reads and writes. It must exist in facts at execution
          time as a number — supplied as an input fact or written by a prior action in this rule.
          A missing required fact throws (no 0 default).
          operand is the arithmetic operand; the unit is dictated by method (percent when
          PERCENTAGE, absolute amount when AMOUNT). Ranges are not constrained — negative values
          and >100 percentages are valid (refunds, surcharges).
          refVar is the base for percentage calculation and is OPTIONAL — omit it to use targetVar
          itself. It is only meaningful in PERCENTAGE × {ASSIGN, ADD, SUB}; specifying it in any
          other cell is an error. Use it when the base differs from the target, e.g.
          "points += orderTotal × 5%" → { targetVar: "points", refVar: "orderTotal",
          operator: "ADD", method: "PERCENTAGE", operand: 5 }.
          operator × method matrix:
            ASSIGN  targetVar = operand              | targetVar = refVar × operand/100
            ADD     targetVar += operand             | targetVar += refVar × operand/100
            SUB     targetVar -= operand             | targetVar -= refVar × operand/100
            MUL     targetVar *= operand             | targetVar *= (operand/100 + 1)
            DIV     targetVar /= operand             | invalid
          Constraints: DIV + PERCENTAGE is invalid (use MUL with the inverse). DIV + AMOUNT
          requires operand !== 0.
        - SET_FACT: { targetVar: string, value: string|number|boolean } Creates the fact if absent
          — this is the only action that does. MUTATE_FACT requires the target to already exist.
        - BLOCK: { reason: string } Records a rejection decision. It does NOT halt rule execution —
          subsequent actions and subsequent winning rules still run. Enforcement is the caller's
          responsibility; the decision surfaces as the isBlocked fact.

        RoundingOption (optional, MUTATE_FACT only): { scale: integer (0..${MAX_ROUNDING_SCALE}), mode?: "HALF_UP"|"HALF_DOWN"|"HALF_EVEN"|"FLOOR"|"CEILING"|"DOWN"|"UP" } mode defaults to HALF_UP. When omitted, calculator output is preserved at full precision (lossless).
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
      // `rule` arrives as text, so long decimals are still intact at this point.
      const body: unknown = parseJson(rule);
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
      const body: unknown = parseJson(rule);
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
