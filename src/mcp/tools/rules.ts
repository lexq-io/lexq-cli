import {
  MAX_CONDITION_DEPTH,
  MAX_CONDITIONS_PER_RULE,
  MAX_LIST_ELEMENTS,
  MAX_NUMBER_FRACTION_DIGITS,
  MAX_NUMBER_INTEGER_DIGITS,
  MAX_RESULT_SIGNIFICANT_DIGITS,
  MAX_ROUNDING_SCALE,
  MAX_RULES_PER_VERSION,
  MAX_STRING_LENGTH,
} from '@/types/constants';
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import dedent from 'dedent';
import type { CallApi } from './_shared';
import { READ_ONLY, ADDITIVE, DESTRUCTIVE } from './_shared';
import { parseJson } from '@/lib/lossless-json';
import {
  CalculationMethod,
  LogicalOperator,
  MutateOperator,
  RoundingPolicy,
  ValueType,
} from '@/types/enums';

// Condition/Action are deeply nested JSON — accept as opaque object via z.record.
// The engine validates structure. MCP schema describes the shape in descriptions.

/** `"A"|"B"|"C"`, the way the shapes below write a field's allowed values. */
const oneOf = (values: readonly string[]): string => values.map((v) => `"${v}"`).join('|');

export function registerRuleTools(server: McpServer, callApi: CallApi): void {
  server.registerTool(
    'lexq_rules_list',
    {
      title: 'List Rules',
      annotations: READ_ONLY,
      description:
        'List all rules in a version (priority ASC). Returns summary with conditionSummary and actionSummary.',
      inputSchema: z.object({
        groupId: z.string().uuid().describe('Policy group ID'),
        versionId: z.string().uuid().describe('Version ID'),
      }),
    },
    async ({ groupId, versionId }) =>
      callApi('GET', `policy-groups/${groupId}/versions/${versionId}/rules`),
  );

  server.registerTool(
    'lexq_rules_get',
    {
      title: 'Get Rule Detail',
      annotations: READ_ONLY,
      description: 'Get full rule detail including condition tree and action definitions.',
      inputSchema: z.object({
        groupId: z.string().uuid().describe('Policy group ID'),
        versionId: z.string().uuid().describe('Version ID'),
        ruleId: z.string().uuid().describe('Rule ID'),
      }),
    },
    async ({ groupId, versionId, ruleId }) =>
      callApi('GET', `policy-groups/${groupId}/versions/${versionId}/rules/${ruleId}`),
  );

  server.registerTool(
    'lexq_rules_create',
    {
      title: 'Create Rule',
      annotations: ADDITIVE,
      description: dedent`
        Create a rule in a DRAFT version. It goes last in priority order; lexq_rules_reorder changes the order.

        An action's targetVar must be a registered fact (ACT-032 otherwise). Keys a rule only reads (condition fields, refVar) may stay unregistered.
        Actions must use facts in the data types they are registered with. MUTATE_FACT's targetVar must be a NUMBER fact, and so must its refVar if that key is registered (ACT-035 otherwise). SET_FACT's value must match the data type of its targetVar (ACT-036 otherwise). For example, "10" does not match a NUMBER fact. A null value matches any data type.

        Condition: { type: "SINGLE", field, operator, value, valueType } or { type: "GROUP", operator: ${oneOf(LogicalOperator)}, children: [...] }
        Value types: ${ValueType.join(', ')}
        Limits: ${MAX_CONDITIONS_PER_RULE} SINGLE conditions per rule (GROUP nodes do not count), ${MAX_CONDITION_DEPTH} levels of nesting below the root, ${MAX_RULES_PER_VERSION} rules per version.
        Value limits: every value in a condition or an action has the same limits as a value in an execution call. A list holds up to ${MAX_LIST_ELEMENTS} items, text up to ${MAX_STRING_LENGTH} characters, and a number up to ${MAX_NUMBER_INTEGER_DIGITS} digits before and ${MAX_NUMBER_FRACTION_DIGITS} after the decimal point. Saving or publishing a rule with a value over a limit fails with P-064, and the message gives the value's path.

        Operators that work on each fact type:
        - STRING: EQUALS, NOT_EQUALS, CONTAINS (substring), IN, NOT_IN
        - NUMBER: EQUALS, NOT_EQUALS, GREATER_THAN, GREATER_THAN_OR_EQUAL, LESS_THAN, LESS_THAN_OR_EQUAL, IN, NOT_IN
        - BOOLEAN: EQUALS, NOT_EQUALS
        - LIST_STRING, LIST_NUMBER: HAS_ANY, HAS_ALL, HAS_NONE
        IN and NOT_IN test whether the fact's value is in the array. HAS_ANY, HAS_ALL and HAS_NONE match when the fact's list holds at least one, all, or none of the array's values. The array holds values of the fact's type, or for a list fact, of its element type.
        Example: { "type": "SINGLE", "field": "userTags", "operator": "HAS_ANY", "value": ["VIP","GOLD"], "valueType": "LIST_STRING" }

        Actions: [{ type, parameters }]
        - MUTATE_FACT: { targetVar, operator: ${oneOf(MutateOperator)}, method: ${oneOf(CalculationMethod)}, operand: number, refVar?, rounding? }
          Reads and writes targetVar. The request must send it (P-015 otherwise), and it must hold a number when the action runs. operand may be negative, and a percent may be over 100.
                    AMOUNT                  PERCENTAGE (base = refVar, or targetVar when omitted)
            ASSIGN  targetVar = operand     targetVar = base × operand/100
            ADD     targetVar += operand    targetVar += base × operand/100
            SUB     targetVar -= operand    targetVar -= base × operand/100
            MUL     targetVar *= operand    targetVar *= (operand/100 + 1)
            DIV     targetVar /= operand    invalid
          refVar is allowed only with PERCENTAGE and ASSIGN, ADD or SUB. DIV with AMOUNT needs a nonzero operand.
          rounding: { scale: integer (0..${MAX_ROUNDING_SCALE}), mode?: ${oneOf(RoundingPolicy)} }. mode defaults to HALF_UP. Without rounding, the result keeps at most ${MAX_RESULT_SIGNIFICANT_DIGITS} significant digits and at most ${MAX_NUMBER_FRACTION_DIGITS} digits after the decimal point, rounded half-even.
          At execution, a result or {targetVar}__delta with more than ${MAX_NUMBER_INTEGER_DIGITS} digits before the decimal point fails the call with ACT-034. Send smaller values or change the calculation. See https://docs.lexq.io/guides/policy-rules#mutate_fact-%E2%80%94-with-rounding for organizations that use Fail-open.
        - SET_FACT: { targetVar, value }, where value matches the data type of targetVar. The request does not have to send targetVar.
        - BLOCK: { reason? } sets isBlocked to true and blockReason to the reason, or "Policy Violation" without one. It does not stop later actions or rules; the caller enforces the block. Only BLOCK writes these two keys: a SET_FACT or MUTATE_FACT targeting either is rejected (ACT-033).

        Every condition is checked against the input facts before any action runs, so a condition never sees a value an action writes in the same request. The winning rules' actions then run in priority order, each on the values the actions before it left.
      `,
      inputSchema: z.object({
        groupId: z.string().uuid().describe('Policy group ID'),
        versionId: z.string().uuid().describe('Version ID'),
        rule: z
          .string()
          .describe(
            'JSON string of CreateRuleRequest: { name, condition, actions, mutexGroup?, mutexMode?, mutexStrategy?, mutexLimit?, isEnabled? }',
          ),
      }),
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
      annotations: DESTRUCTIVE,
      description: `Update an existing rule in a DRAFT version. Only provided fields are changed. A new condition tree must stay within ${MAX_CONDITIONS_PER_RULE} conditions (SINGLE nodes) and ${MAX_CONDITION_DEPTH} levels of nesting below the root. Saving re-checks every action in the rule, including ones you did not change. Saving fails with P-064 if a value in the new condition tree or in any action is over the value limits that lexq_rules_create lists, with ACT-032 if an action's targetVar is not a registered fact, with ACT-035 if a MUTATE_FACT uses a registered fact that is not a NUMBER fact, and with ACT-036 if a SET_FACT value does not match the data type of its targetVar.`,
      inputSchema: z.object({
        groupId: z.string().uuid().describe('Policy group ID'),
        versionId: z.string().uuid().describe('Version ID'),
        ruleId: z.string().uuid().describe('Rule ID'),
        rule: z
          .string()
          .describe(
            'JSON string of UpdateRuleRequest: { name?, condition?, actions?, mutexGroup?, mutexMode?, mutexStrategy?, mutexLimit?, isEnabled? }',
          ),
      }),
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
      annotations: DESTRUCTIVE,
      description: 'Delete a rule from a DRAFT version.',
      inputSchema: z.object({
        groupId: z.string().uuid().describe('Policy group ID'),
        versionId: z.string().uuid().describe('Version ID'),
        ruleId: z.string().uuid().describe('Rule ID'),
      }),
    },
    async ({ groupId, versionId, ruleId }) =>
      callApi('DELETE', `policy-groups/${groupId}/versions/${versionId}/rules/${ruleId}`),
  );

  server.registerTool(
    'lexq_rules_reorder',
    {
      title: 'Reorder Rules',
      annotations: DESTRUCTIVE,
      description:
        'Reorder rules by specifying rule IDs in desired order. Priorities are assigned 1...N (1-based, continuous); array index 0 = priority 1 (highest precedence).',
      inputSchema: z.object({
        groupId: z.string().uuid().describe('Policy group ID'),
        versionId: z.string().uuid().describe('Version ID'),
        ruleIds: z.array(z.string().uuid()).describe('Rule IDs in desired priority order'),
      }),
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
      annotations: DESTRUCTIVE,
      description: 'Enable or disable a rule without deleting it.',
      inputSchema: z.object({
        groupId: z.string().uuid().describe('Policy group ID'),
        versionId: z.string().uuid().describe('Version ID'),
        ruleId: z.string().uuid().describe('Rule ID'),
        isEnabled: z.boolean().describe('true to enable, false to disable'),
      }),
    },
    async ({ groupId, versionId, ruleId, isEnabled }) =>
      callApi('PATCH', `policy-groups/${groupId}/versions/${versionId}/rules/${ruleId}/enabled`, {
        body: { isEnabled },
      }),
  );
}
