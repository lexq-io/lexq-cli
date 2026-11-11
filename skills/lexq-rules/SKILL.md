---
name: lexq-rules
description: Writing LexQ policy rules with the lexq CLI, including condition syntax, the action types (MUTATE_FACT, SET_FACT, BLOCK), rule order, enabling and disabling rules, and mutex groups for rule-level conflict resolution. Use when creating, changing, or reordering the rules of a draft policy version, or when reviewing rules.
---

# LexQ CLI — Policy Rules

> **Prerequisite:** Read `lexq-shared/SKILL.md` first.

## Overview

A **Policy Rule** is a condition → actions pair within a version. Rules are evaluated in priority
order — **lower number wins**, and priorities are 1-based (1 is highest). When a rule's condition
matches the input facts, its actions fire.

`priority` is assigned by the server, not by you. New rules are appended last. Use
`lexq rules reorder` to change the order.

## Rule Structure

```json
{
  "name": "VIP 10% Discount",
  "condition": {
    ...
  },
  "actions": [
    ...
  ],
  "mutexGroup": null,
  "mutexMode": "NONE",
  "mutexStrategy": "HIGHEST_PRIORITY",
  "mutexLimit": null,
  "isEnabled": true
}
```

## Condition Syntax

Conditions use a tree structure with two node types: `SINGLE` and `GROUP`.

### SINGLE Condition

```json
{
  "type": "SINGLE",
  "field": "paymentAmount",
  "operator": "GREATER_THAN_OR_EQUAL",
  "value": 100000,
  "valueType": "NUMBER"
}
```

### GROUP Condition (logical combinator)

```json
{
  "type": "GROUP",
  "operator": "AND",
  "children": [
    {
      "type": "SINGLE",
      "field": "customerTier",
      "operator": "EQUALS",
      "value": "VIP",
      "valueType": "STRING"
    },
    {
      "type": "SINGLE",
      "field": "paymentAmount",
      "operator": "GREATER_THAN",
      "value": 50000,
      "valueType": "NUMBER"
    }
  ]
}
```

### Operators

Operators are constrained by the **left fact's type**. Using one outside its type is rejected
by the server — check `lexq facts list` before choosing.

| Fact type                     | Allowed operators                                                                                                  |
|-------------------------------|--------------------------------------------------------------------------------------------------------------------|
| `STRING`                      | `EQUALS`, `NOT_EQUALS`, `CONTAINS`, `IN`, `NOT_IN`                                                                 |
| `NUMBER`                      | `EQUALS`, `NOT_EQUALS`, `GREATER_THAN`, `GREATER_THAN_OR_EQUAL`, `LESS_THAN`, `LESS_THAN_OR_EQUAL`, `IN`, `NOT_IN` |
| `BOOLEAN`                     | `EQUALS`, `NOT_EQUALS`                                                                                             |
| `LIST_STRING` / `LIST_NUMBER` | `HAS_ANY`, `HAS_ALL`, `HAS_NONE`                                                                                   |

| Operator                                                                      | Description                                                | `value` |
|-------------------------------------------------------------------------------|------------------------------------------------------------|---------|
| `EQUALS` / `NOT_EQUALS`                                                       | Exact match / negation                                     | scalar  |
| `GREATER_THAN` / `GREATER_THAN_OR_EQUAL` / `LESS_THAN` / `LESS_THAN_OR_EQUAL` | Numeric comparison                                         | scalar  |
| `CONTAINS`                                                                    | **Substring** match on a STRING fact — not list membership | scalar  |
| `IN` / `NOT_IN`                                                               | Scalar fact is (not) in the given list                     | array   |
| `HAS_ANY`                                                                     | List fact has **at least one** of the given values         | array   |
| `HAS_ALL`                                                                     | List fact has **all** of the given values                  | array   |
| `HAS_NONE`                                                                    | List fact has **none** of the given values                 | array   |

**`IN` vs `HAS_*` — mirrors of each other.** This is the most common mistake here:

```json
// scalar fact, list value
{
  "field": "region",
  "operator": "IN",
  "value": [
    "KR",
    "JP"
  ],
  "valueType": "LIST_STRING"
}

// list fact, list value
{
  "field": "userTags",
  "operator": "HAS_ANY",
  "value": [
    "VIP",
    "GOLD"
  ],
  "valueType": "LIST_STRING"
}
```

Do **not** use `CONTAINS` on a list fact — that idiom works in some rule engines but is rejected here.

### Value Types

| Type          | JSON Value   | Example          |
|---------------|--------------|------------------|
| `STRING`      | `"string"`   | `"VIP"`          |
| `NUMBER`      | `number`     | `100000`         |
| `BOOLEAN`     | `true/false` | `true`           |
| `LIST_STRING` | `["a","b"]`  | `["KR","US"]`    |
| `LIST_NUMBER` | `[1,2]`      | `[10000, 20000]` |

A value you write in a condition or an action has the same limits as a value in an execution call.
A list can hold up to 1,000 items, text up to 4,096 characters, and a number up to 34 digits before
and 34 after the decimal point. Saving or publishing a rule with a value over a limit fails with
`P-064`, and the message gives the value's path. See
[Value Limits](https://docs.lexq.io/api/execution#value-limits) for how characters and digits are
counted.

### Nested Conditions Example

`(customerTier = "VIP" AND paymentAmount >= 100000) OR region IN ["KR", "JP"]`:

```json
{
  "type": "GROUP",
  "operator": "OR",
  "children": [
    {
      "type": "GROUP",
      "operator": "AND",
      "children": [
        {
          "type": "SINGLE",
          "field": "customerTier",
          "operator": "EQUALS",
          "value": "VIP",
          "valueType": "STRING"
        },
        {
          "type": "SINGLE",
          "field": "paymentAmount",
          "operator": "GREATER_THAN_OR_EQUAL",
          "value": 100000,
          "valueType": "NUMBER"
        }
      ]
    },
    {
      "type": "SINGLE",
      "field": "region",
      "operator": "IN",
      "value": [
        "KR",
        "JP"
      ],
      "valueType": "LIST_STRING"
    }
  ]
}
```

## Action Types

Each rule can have multiple actions. Actions fire sequentially.

| Type          | Description                                | Key Parameters                                                       |
|---------------|--------------------------------------------|----------------------------------------------------------------------|
| `MUTATE_FACT` | Arithmetic change to a numeric fact        | `targetVar`, `operator`, `method`, `operand`, `refVar?`, `rounding?` |
| `SET_FACT`    | Assign a literal value to a registered fact | `targetVar`, `value`                                                |
| `BLOCK`       | Record a rejection decision                | `reason?`                                                            |

### `MUTATE_FACT` parameters

| Parameter   | Required | Meaning                                                                       |
|-------------|----------|-------------------------------------------------------------------------------|
| `targetVar` | always   | The fact this action **reads and writes**. Must be registered and present as a number at execution. |
| `operator`  | always   | `ASSIGN` \| `ADD` \| `SUB` \| `MUL` \| `DIV`                                  |
| `method`    | always   | `PERCENTAGE` \| `AMOUNT` — dictates the unit of `operand`                     |
| `operand`   | always   | The arithmetic operand. Percent when PERCENTAGE, absolute amount when AMOUNT. |
| `refVar`    | optional | Base for percentage calculation. Omit to use `targetVar` itself.              |
| `rounding`  | optional | `{ scale: 0..34, mode?: HALF_UP \| ... }`. Without it, the result keeps at most 34 significant digits and at most 34 digits after the decimal point, rounded half-even. |

**operator × method matrix**

| operator | `AMOUNT`               | `PERCENTAGE`                        |
|----------|------------------------|-------------------------------------|
| `ASSIGN` | `targetVar = operand`  | `targetVar = refVar × operand/100`  |
| `ADD`    | `targetVar += operand` | `targetVar += refVar × operand/100` |
| `SUB`    | `targetVar -= operand` | `targetVar -= refVar × operand/100` |
| `MUL`    | `targetVar *= operand` | `targetVar *= (operand/100 + 1)`    |
| `DIV`    | `targetVar /= operand` | **invalid**                         |

`DIV` + `PERCENTAGE` is rejected — use `MUL` with the inverse. `DIV` + `AMOUNT` requires
`operand !== 0`.

**`refVar` is only meaningful in `PERCENTAGE` × {`ASSIGN`, `ADD`, `SUB`}.** Specifying it in any
other cell is an error, not a silent no-op. `AMOUNT` has no base concept, and `MUL` × `PERCENTAGE`
is a multiplier shorthand that does not read a base.

Use `refVar` when the base differs from the target:

```json
{
  "type": "MUTATE_FACT",
  "parameters": {
    "targetVar": "loyaltyPoint",
    "refVar": "orderTotal",
    "operator": "ADD",
    "method": "PERCENTAGE",
    "operand": 5
  }
}
```

`loyaltyPoint += orderTotal × 5%` — two different facts. Omitting `refVar` would compute
`loyaltyPoint += loyaltyPoint × 5%` instead.

**Ranges are not constrained.** Negative operands and percentages above 100 are valid — refunds
(`-5`), surcharges (`150`), risk scores, and game points all need them.

At execution, a result or `{targetVar}__delta` with more than 34 digits before the decimal
point fails the call with `ACT-034`. Send smaller values or change the calculation. For
organizations that use Fail-open, see
[MUTATE_FACT with rounding](https://docs.lexq.io/guides/policy-rules#mutate_fact-%E2%80%94-with-rounding).

### `SET_FACT` vs `MUTATE_FACT`

Both actions write to `targetVar`, and it must be a **registered fact**. Saving or publishing a
rule whose `targetVar` is not registered fails with `ACT-032`; register it with
`lexq facts create` first. Keys a rule only reads (condition fields, `refVar`) may stay
unregistered.

Actions must also use facts in the data types they are registered with. The `targetVar` of
`MUTATE_FACT` must be a `NUMBER` fact, and so must its `refVar` if that key is registered. If either
is registered with another data type, saving or publishing the rule fails with `ACT-035`. If the
`value` of `SET_FACT` does not match the data type of its `targetVar`, saving or publishing the rule
fails with `ACT-036`. For example, `"10"` does not match a `NUMBER` fact. A `null` value matches any
data type.

At execution, `SET_FACT` and `MUTATE_FACT` differ in what the request must send. `SET_FACT` writes
the value even when the request did not send the key. `MUTATE_FACT` requires the request to send the
target (`P-015` otherwise), and the target's value must be a number when the action runs. "Write
something the request didn't send" is `SET_FACT`'s job.

### `BLOCK` does not halt execution

`BLOCK` records a rejection decision by writing `isBlocked` (`true`) and `blockReason` (`reason`,
or `Policy Violation` when omitted). Subsequent actions in the same rule and subsequent winning
rules still run. Enforcement is the caller's responsibility — read `isBlocked` from the response.

Only `BLOCK` writes those two keys. Saving or publishing a rule whose `SET_FACT` or
`MUTATE_FACT` targets either one fails with `ACT-033`. No condition sees what `BLOCK` writes
in the same request: every condition is checked against the input facts before any action runs.

### Action Example: 10% Discount via MUTATE_FACT

Reduces `paymentAmount` by 10%. `__delta` is auto-generated in `generatedVariables` (e.g.,
`paymentAmount__delta: -10000` for a 100,000 input).

```json
{
  "type": "MUTATE_FACT",
  "parameters": {
    "targetVar": "paymentAmount",
    "method": "PERCENTAGE",
    "operator": "SUB",
    "operand": 10,
    "rounding": {
      "mode": "HALF_UP",
      "scale": 0
    }
  }
}
```

### Action Example: Block Transaction

```json
{
  "type": "BLOCK",
  "parameters": {
    "reason": "Suspected fraud"
  }
}
```

## CRUD Commands

### List Rules

```bash
lexq rules list --group-id <gid> --version-id <vid> --page 0 --size 20
```

### Get Rule Detail

```bash
lexq rules get --group-id <gid> --version-id <vid> --id <ruleId>
```

### Create Rule

**Important:** Always run `lexq facts list` first to confirm available fact keys and types.

```bash
lexq rules create --group-id <gid> --version-id <vid> --json '{
  "name": "VIP 10% Discount",
  "condition": {
    "type": "GROUP",
    "operator": "AND",
    "children": [
      { "type": "SINGLE", "field": "customerTier", "operator": "EQUALS", "value": "VIP", "valueType": "STRING" },
      { "type": "SINGLE", "field": "paymentAmount", "operator": "GREATER_THAN_OR_EQUAL", "value": 100000, "valueType": "NUMBER" }
    ]
  },
  "actions": [
    {
      "type": "MUTATE_FACT",
      "parameters": {
        "targetVar": "paymentAmount",
        "method": "PERCENTAGE",
        "operator": "SUB",
        "operand": 10,
        "rounding": { "mode": "HALF_UP", "scale": 0 }
      }
    }
  ],
  "isEnabled": true
}'
```

### Update Rule

```bash
lexq rules update --group-id <gid> --version-id <vid> --id <ruleId> --json '{
  "name": "VIP 15% Discount",
  "actions": [
    {
      "type": "MUTATE_FACT",
      "parameters": {
        "targetVar": "paymentAmount",
        "method": "PERCENTAGE",
        "operator": "SUB",
        "operand": 15,
        "rounding": { "mode": "HALF_UP", "scale": 0 }
      }
    }
  ]
}'
```

### Delete Rule

```bash
lexq rules delete --group-id <gid> --version-id <vid> --id <ruleId>
lexq rules delete --group-id <gid> --version-id <vid> --id <ruleId> --force
```

### Reorder Rules

Pass rule IDs in desired order. The server assigns priority 1, 2, 3, … — the first ID becomes
priority 1 (highest):

```bash
lexq rules reorder --group-id <gid> --version-id <vid> \
  --rule-ids "ruleId_A,ruleId_B,ruleId_C"
```

### Toggle Rule

Enable or disable a rule without deleting it:

```bash
lexq rules toggle --group-id <gid> --version-id <vid> --id <ruleId> --enabled true
lexq rules toggle --group-id <gid> --version-id <vid> --id <ruleId> --enabled false
```

## Mutex (Rule-Level Conflict Resolution)

Within a single version, rules can belong to a `mutexGroup` to limit how many fire.

| mutexMode   | Behavior                                                      |
|-------------|---------------------------------------------------------------|
| `NONE`      | All matching rules fire (default)                             |
| `EXCLUSIVE` | Only one rule per mutex group fires                           |
| `MAX_N`     | Up to `mutexLimit` rules fire. Omit it and the server sets 2. |

```bash
lexq rules create --group-id <gid> --version-id <vid> --json '{
  "name": "Discount A",
  "mutexGroup": "discounts",
  "mutexMode": "EXCLUSIVE",
  "mutexStrategy": "HIGHEST_PRIORITY",
  "condition": { ... },
  "actions": [ ... ]
}'

# Top two of the group fire
lexq rules create --group-id <gid> --version-id <vid> --json '{
  "name": "Stackable Promo A",
  "mutexGroup": "promos",
  "mutexMode": "MAX_N",
  "mutexLimit": 2,
  "mutexStrategy": "HIGHEST_PRIORITY",
  "condition": { ... },
  "actions": [ ... ]
}'
```

**Constraint:** All rules in the same `mutexGroup` must use identical `mutexMode` and `mutexStrategy`.

**`mutexGroup` is what turns mutex on.** Sending `mutexMode` without a `mutexGroup` is silently normalized to `NONE` —
there is no group to be exclusive within. Conversely, setting a `mutexGroup` without a `mutexMode` defaults to
`EXCLUSIVE`.

`mutexStrategy` currently accepts only `HIGHEST_PRIORITY` — the rule with the lowest priority
number in the group wins. `mutexMode: MAX_N` requires `mutexLimit`; omit it and the server
sets 2.

## Pre-Create Checklist

Before creating rules, always:

1. **Check available facts:** `lexq facts list`
2. **Confirm the version is DRAFT:** `lexq versions get --group-id <gid> --id <vid>` → status must be `DRAFT`
3. **Use exact fact keys** from the fact definitions (case-sensitive)
4. **Match value types** — a fact defined as `NUMBER` must receive numeric values, not strings
5. **Match the operator to the fact type** — list-typed facts accept only `HAS_ANY` / `HAS_ALL` / `HAS_NONE`