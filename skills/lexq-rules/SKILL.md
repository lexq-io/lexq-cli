# LexQ CLI — Policy Rules

> **Prerequisite:** Read `lexq-shared/SKILL.md` first.

## Overview

A **Policy Rule** is a condition → actions pair within a version. Rules are evaluated in priority order (0 = highest). When a rule's condition matches the input facts, its actions fire.

## Rule Structure

```json
{
  "name": "VIP 10% Discount",
  "priority": 0,
  "condition": { ... },
  "actions": [ ... ],
  "mutexGroup": null,
  "mutexMode": "NONE",
  "mutexStrategy": "FIRST_MATCH",
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
  "field": "payment_amount",
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
      "field": "customer_tier",
      "operator": "EQUALS",
      "value": "VIP",
      "valueType": "STRING"
    },
    {
      "type": "SINGLE",
      "field": "payment_amount",
      "operator": "GREATER_THAN",
      "value": 50000,
      "valueType": "NUMBER"
    }
  ]
}
```

### Operators

| Operator | Types | Description |
|---|---|---|
| `EQUALS` | all | Exact match |
| `NOT_EQUALS` | all | Negation |
| `GREATER_THAN` | NUMBER | `>` |
| `GREATER_THAN_OR_EQUAL` | NUMBER | `>=` |
| `LESS_THAN` | NUMBER | `<` |
| `LESS_THAN_OR_EQUAL` | NUMBER | `<=` |
| `CONTAINS` | STRING | Substring match |
| `IN` | STRING, NUMBER | Value is in the provided list |
| `NOT_IN` | STRING, NUMBER | Value is not in the provided list |

### Value Types

| Type | JSON Value | Example |
|---|---|---|
| `STRING` | `"string"` | `"VIP"` |
| `NUMBER` | `number` | `100000` |
| `BOOLEAN` | `true/false` | `true` |
| `LIST_STRING` | `["a","b"]` | `["KR","US"]` |
| `LIST_NUMBER` | `[1,2]` | `[10000, 20000]` |

### Nested Conditions Example

`(customer_tier = "VIP" AND payment_amount >= 100000) OR region IN ["KR", "JP"]`:

```json
{
  "type": "GROUP",
  "operator": "OR",
  "children": [
    {
      "type": "GROUP",
      "operator": "AND",
      "children": [
        { "type": "SINGLE", "field": "customer_tier", "operator": "EQUALS", "value": "VIP", "valueType": "STRING" },
        { "type": "SINGLE", "field": "payment_amount", "operator": "GREATER_THAN_OR_EQUAL", "value": 100000, "valueType": "NUMBER" }
      ]
    },
    {
      "type": "SINGLE", "field": "region", "operator": "IN", "value": ["KR", "JP"], "valueType": "LIST_STRING"
    }
  ]
}
```

## Action Types

Each rule can have multiple actions. Actions fire sequentially.

| Type | Description | Key Parameters |
|---|---|---|
| `DISCOUNT` | Apply a discount | `method` (PERCENTAGE/FIXED), `rate`, `refVar` |
| `POINT` | Award points | `amount`, `pointType` |
| `COUPON_ISSUE` | Issue a coupon | `couponId`, `expiryDays` |
| `BLOCK` | Block the transaction | `reason`, `code` |
| `NOTIFICATION` | Send notification | `channel`, `template` |
| `WEBHOOK` | Call external URL | `url`, `method`, `headers`, `body` |
| `SET_FACT` | Set an output variable | `key`, `value` |
| `ADD_TAG` | Add a tag to the result | `tag` |

### Action Example: 10% Percentage Discount

```json
{
  "type": "DISCOUNT",
  "parameters": {
    "method": "PERCENTAGE",
    "rate": 10,
    "refVar": "payment_amount"
  }
}
```

### Action Example: Block Transaction

```json
{
  "type": "BLOCK",
  "parameters": {
    "reason": "Suspected fraud",
    "code": "FRAUD_DETECTED"
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
  "priority": 0,
  "condition": {
    "type": "GROUP",
    "operator": "AND",
    "children": [
      { "type": "SINGLE", "field": "customer_tier", "operator": "EQUALS", "value": "VIP", "valueType": "STRING" },
      { "type": "SINGLE", "field": "payment_amount", "operator": "GREATER_THAN_OR_EQUAL", "value": 100000, "valueType": "NUMBER" }
    ]
  },
  "actions": [
    {
      "type": "DISCOUNT",
      "parameters": { "method": "PERCENTAGE", "rate": 10, "refVar": "payment_amount" }
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
      "type": "DISCOUNT",
      "parameters": { "method": "PERCENTAGE", "rate": 15, "refVar": "payment_amount" }
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

Pass rule IDs in desired priority order (index 0 = highest priority):

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

| mutexMode | Behavior |
|---|---|
| `NONE` | All matching rules fire (default) |
| `EXCLUSIVE` | Only one rule per mutex group fires |
| `MAX_N` | Up to `mutexLimit` rules per mutex group fire |

```bash
lexq rules create --group-id <gid> --version-id <vid> --json '{
  "name": "Discount A",
  "priority": 0,
  "mutexGroup": "discounts",
  "mutexMode": "EXCLUSIVE",
  "mutexStrategy": "HIGHEST_PRIORITY",
  "condition": { ... },
  "actions": [ ... ]
}'
```

**Constraint:** All rules in the same `mutexGroup` must use identical `mutexMode` and `mutexStrategy`.

## Pre-Create Checklist

Before creating rules, always:

1. **Check available facts:** `lexq facts list`
2. **Confirm the version is DRAFT:** `lexq versions get --group-id <gid> --id <vid>` → status must be `DRAFT`
3. **Use exact fact keys** from the fact definitions (snake_case, case-sensitive)
4. **Match value types** — a fact defined as `NUMBER` must receive numeric values, not strings