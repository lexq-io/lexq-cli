# LexQ CLI — Simulation & Testing

> **Prerequisite:** Read `lexq-shared/SKILL.md` first.

## Overview

LexQ provides three levels of pre-deploy validation:

| Tool                | Scope                      | When to Use                        |
|---------------------|----------------------------|------------------------------------|
| **Dry Run**         | Single input               | Quick validation of one scenario   |
| **Dry Run Compare** | Single input, two versions | Side-by-side version comparison    |
| **Simulation**      | Batch (historical data)    | Full regression test before deploy |

**Golden rule:** Always dry-run before publishing, always simulate before deploying to production.

## 1. Requirements Analysis

Before testing, check what facts a version expects:

```bash
lexq analytics requirements --group-id <gid> --version-id <vid>
```

Response includes:

```json
{
  "groupId": "...",
  "versionId": "...",
  "versionNo": 3,
  "requiredFacts": [
    {
      "key": "paymentAmount",
      "type": "NUMBER",
      "required": true,
      "usedBy": [
        "VIP Discount",
        "Premium Block"
      ]
    },
    {
      "key": "customerTier",
      "type": "STRING",
      "required": true,
      "usedBy": [
        "VIP Discount"
      ]
    }
  ],
  "exampleRequest": {
    "facts": {
      "paymentAmount": 0,
      "customerTier": ""
    },
    "context": {}
  }
}
```

**Always run this before dry-run.** Copy `exampleRequest.facts` as your starting template and fill in real values.

`exampleRequest.context` comes back empty, and it stays empty even when the group has an A/B test
running. Live execution requests against such a group also need `context.trafficKey` or the test
version receives no traffic — see the A/B testing section of the groups skill. Dry-run itself is
unaffected: it always evaluates the version you name, so routing never applies here.

## 2. Dry Run (Single Input)

Test a single set of facts against a version:

```bash
lexq analytics dry-run --version-id <vid> --json '{
  "facts": {
    "paymentAmount": 150000,
    "customerTier": "VIP"
  }
}'
```

### Options

| Flag            | Description                                         | Default |
|-----------------|-----------------------------------------------------|---------|
| `--debug`       | Include execution traces (which rules matched, why) | `false` |
| `--file <path>` | Read request body from file instead of `--json`     | —       |

### Recommended: Always Use `--debug`

```bash
lexq analytics dry-run --version-id <vid> --debug --json '{
  "facts": { "paymentAmount": 150000, "customerTier": "VIP" }
}'
```

Dry run has no side effects — actions only mutate the fact map in memory. There is nothing
external to mock.

### Response Structure

```json
{
  "result": "SUCCESS",
  "data": {
    "inputFacts": {
      "paymentAmount": 150000,
      "customerTier": "VIP"
    },
    "mutatedFacts": {
      "paymentAmount": 135000,
      "customerTier": "VIP"
    },
    "generatedVariables": {
      "paymentAmount__delta": -15000
    },
    "executionTraces": [
      {
        "ruleId": "...",
        "ruleName": "VIP 10% Discount",
        "matched": true,
        "matchExpression": "(customerTier == 'VIP') && (paymentAmount >= 100000)",
        "generatedActions": [
          {
            "type": "MUTATE_FACT",
            "parameters": {
              ...
            }
          }
        ]
      }
    ],
    "decisionTraces": [
      {
        "ruleId": "...",
        "ruleName": "VIP 10% Discount",
        "status": "SELECTED",
        "reasonCode": "FINAL_WINNER",
        "reasonDetail": "..."
      }
    ],
    "latencyMs": 12,
    "versionNo": 3
  }
}
```

- `mutatedFacts` — input facts changed by rule actions (e.g., `MUTATE_FACT` reduces `paymentAmount`)
- `generatedVariables` — for every fact in `mutatedFacts`, a paired `{factName}__delta` key is auto-generated with the
  signed difference (negative = decrease, positive = increase)

### Reading Decision Traces

Each trace carries a `status` (what happened) and a `reasonCode` (why).

| Status     | Meaning                                                                         |
|------------|---------------------------------------------------------------------------------|
| `SELECTED` | Rule matched and its actions fired                                              |
| `NO_MATCH` | Condition did not match, or could not be evaluated                              |
| `BLOCKED`  | Matched but lost conflict resolution — see `reasonCode` for which round and why |
| `ERROR`    | Action execution failed                                                         |

`BLOCKED` is unrelated to the `BLOCK` action. A `BLOCK` action writes the `isBlocked` fact and its own rule stays
`SELECTED`; `BLOCKED` means the rule was dropped by activation-group or mutex competition.

### Reading Reason Codes

| Code                  | Meaning                                                  |
|-----------------------|----------------------------------------------------------|
| `FINAL_WINNER`        | Successfully executed                                    |
| `CONDITION_MISMATCH`  | Condition not satisfied, or could not be evaluated       |
| `MUTEX_PRIORITY_LOST` | Another rule in the same mutex group had higher priority |
| `MUTEX_LIMIT_REACHED` | Mutex group's max rules already fired                    |
| `GROUP_PRIORITY_LOST` | Another group in the same activation group won           |
| `GROUP_LIMIT_REACHED` | Group's `executionLimit` reached                         |
| `ACTION_ERROR`        | Action execution failed (e.g. required fact absent)      |
| `ENGINE_ERROR`        | Internal engine failure                                  |

A version outside its effective date range is filtered **before** evaluation — no trace is produced for it at all. If a
rule you expect never appears in `decisionTraces`, check the version's `effectiveFrom` / `effectiveTo` with
`lexq versions get`.

#### `reasonDetail` on unevaluable conditions

`CONDITION_MISMATCH` covers two different things, distinguished by `reasonDetail`:

- **empty** — the condition was evaluated and did not match
- **`Evaluation error: <code>`** — the condition could not be evaluated at all

| Code                    | Meaning                                                            |
|-------------------------|--------------------------------------------------------------------|
| `FACT_NOT_PROVIDED`     | The rule references a fact absent from the request                 |
| `FACT_TYPE_MISMATCH`    | The fact's runtime type does not match the condition               |
| `UNSUPPORTED_FACT_TYPE` | Operator not valid for the fact's type (e.g. `CONTAINS` on a list) |
| `MALFORMED_RULE`        | The stored rule is structurally invalid                            |

A rule from another group referencing facts you did not send yields `FACT_NOT_PROVIDED` — this
is normal, not an error.

## 3. Dry Run Compare

Compare how two versions evaluate the same input:

```bash
lexq analytics dry-run-compare --json '{
  "facts": { "paymentAmount": 150000, "customerTier": "VIP" },
  "versionIdA": "<baselineVersionId>",
  "versionIdB": "<candidateVersionId>"
}'
```

Useful for validating that changes in a new version produce expected differences.

## 4. Impact Simulation

Run a full regression test against historical execution data:

### Start Simulation

```bash
lexq analytics simulation start --json '{
  "policyVersionId": "<targetVersionId>",
  "dataset": {
    "type": "HISTORICAL",
    "source": "EXECUTION_LOGS",
    "from": "2025-01-01",
    "to": "2025-01-31"
  },
  "options": {
    "includeRuleStats": true,
    "maxRecords": 10000,
    "baselinePolicyVersionId": "<currentLiveVersionId>",
    "metricConfig": {
      "targetVariable": "paymentAmount__delta",
      "aggregationType": "SUM"
    }
  }
}'
```

### Dataset Types

| Type         | Source           | Description                               |
|--------------|------------------|-------------------------------------------|
| `HISTORICAL` | `EXECUTION_LOGS` | Replay past executions from a date range  |
| `MANUAL`     | `REQUEST_BODY`   | Provide `manualData` array in the request |
| `UPLOADED`   | `S3_BUCKET`      | Reference an uploaded dataset by `path`   |

### File Upload Dataset

```bash
# 1. Download template (optional)
lexq analytics dataset template \
  --group-id <gid> --version-id <vid> --format csv --output template.csv

# 2. Upload dataset
lexq analytics dataset upload --file ./my-data.csv
# → path: datasets/<tenantId>/a1b2c3d4e5f6.csv

# 3. Start simulation with uploaded path
lexq analytics simulation start --json '{
  "policyVersionId": "<vid>",
  "dataset": {
    "type": "UPLOADED",
    "source": "S3_BUCKET",
    "path": "<path returned by dataset upload>"
  },
  "options": { "includeRuleStats": true, "maxRecords": 10000 }
}'
```

**CSV format:** Header row with fact keys, data rows with values. Types auto-detected.
**JSON format:** Array of objects `[{"key": "value"}, ...]`

### Check Status (Poll)

```bash
lexq analytics simulation status --id <simulationId>
```

Simulation is async. Poll until `status` is `COMPLETED` or `FAILED`.

| Status      | Meaning                                    |
|-------------|--------------------------------------------|
| `PENDING`   | Queued                                     |
| `RUNNING`   | In progress (`progress` field shows 0–100) |
| `COMPLETED` | Done — results available                   |
| `FAILED`    | Error occurred                             |
| `CANCELED`  | Manually canceled                          |

### List Simulations

```bash
lexq analytics simulation list --page 0 --size 20
lexq analytics simulation list --status COMPLETED --from 2025-01-01 --to 2025-01-31
```

### Cancel Simulation

```bash
lexq analytics simulation cancel --id <simulationId>
lexq analytics simulation cancel --id <simulationId> --force
```

### Export Results

```bash
lexq analytics simulation export --id <simulationId> --format json
lexq analytics simulation export --id <simulationId> --format csv --output results.csv
```

## Simulation Response (COMPLETED)

```json
{
  "simulationId": "...",
  "status": "COMPLETED",
  "summary": {
    "totalRecords": 10000,
    "matchedRecords": 8500,
    "executionTimeMs": 3200,
    "matchRate": 0.85
  },
  "metricSummary": {
    "targetVariable": "paymentAmount__delta",
    "aggregationType": "SUM",
    "baselineValue": 5000000,
    "simulatedValue": 4500000,
    "delta": -500000,
    "deltaPercentage": -10.0
  },
  "policyImpact": {
    "policyVersionId": "...",
    "comparison": {
      "baselineVersionId": "...",
      "difference": {
        "matchedCountDelta": -200,
        "matchedRateDelta": -0.02,
        "metricValueDelta": -500000
      }
    }
  },
  "ruleStats": [
    {
      "ruleId": "...",
      "ruleName": "VIP Discount",
      "matchedCount": 5000,
      "metricValue": 3000000
    }
  ]
}
```

## Agent Workflow: Validate Before Deploy

```bash
# 1. Check what facts the version needs
lexq analytics requirements --group-id <gid> --version-id <vid>

# 2. Dry-run with representative inputs
lexq analytics dry-run --version-id <vid> --debug --json '{
  "facts": { "paymentAmount": 150000, "customerTier": "VIP" }
}'

# 3. If dry-run looks good, publish
lexq deploy publish --group-id <gid> --version-id <vid> --memo "Validated by agent"

# 4. Run simulation comparing new vs. current live version
lexq analytics simulation start --json '{
  "policyVersionId": "<newVersionId>",
  "dataset": { "type": "HISTORICAL", "source": "EXECUTION_LOGS", "from": "2025-01-01", "to": "2025-01-31" },
  "options": {
    "baselinePolicyVersionId": "<currentLiveVersionId>",
    "includeRuleStats": true,
    "metricConfig": { "targetVariable": "paymentAmount__delta", "aggregationType": "SUM" }
  }
}'

# 5. Poll until complete
lexq analytics simulation status --id <simId>

# 6. If results acceptable, deploy
lexq deploy live --group-id <gid> --version-id <newVersionId> --memo "Simulation passed"
```