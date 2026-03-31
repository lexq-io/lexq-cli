# LexQ CLI — Simulation & Testing

> **Prerequisite:** Read `lexq-shared/SKILL.md` first.

## Overview

LexQ provides three levels of pre-deploy validation:

| Tool | Scope | When to Use |
|---|---|---|
| **Dry Run** | Single input | Quick validation of one scenario |
| **Dry Run Compare** | Single input, two versions | Side-by-side version comparison |
| **Simulation** | Batch (historical data) | Full regression test before deploy |

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
    { "key": "payment_amount", "type": "NUMBER", "required": true, "usedBy": ["VIP Discount", "Premium Block"] },
    { "key": "customer_tier", "type": "STRING", "required": true, "usedBy": ["VIP Discount"] }
  ],
  "exampleRequest": {
    "facts": { "payment_amount": 0, "customer_tier": "" },
    "context": {}
  }
}
```

**Always run this before dry-run.** Copy `exampleRequest.facts` as your starting template and fill in real values.

## 2. Dry Run (Single Input)

Test a single set of facts against a version:

```bash
lexq analytics dry-run --version-id <vid> --json '{
  "facts": {
    "payment_amount": 150000,
    "customer_tier": "VIP"
  }
}'
```

### Options

| Flag | Description | Default |
|---|---|---|
| `--debug` | Include execution traces (which rules matched, why) | `false` |
| `--mock` | Mock external calls (webhooks, integrations) | `false` |
| `--file <path>` | Read request body from file instead of `--json` | — |

### Recommended: Always Use `--debug --mock`

```bash
lexq analytics dry-run --version-id <vid> --debug --mock --json '{
  "facts": { "payment_amount": 150000, "customer_tier": "VIP" }
}'
```

### Response Structure

```json
{
  "outputVariables": { "discount_amount": 15000 },
  "executionTraces": [
    {
      "traceId": "...",
      "ruleId": "...",
      "ruleName": "VIP 10% Discount",
      "matched": true,
      "matchExpression": "(customer_tier == VIP AND payment_amount >= 100000)",
      "generatedActions": [ { "type": "DISCOUNT", "parameters": { ... } } ]
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
```

### Reading Decision Traces

| Status | Meaning |
|---|---|
| `SELECTED` | Rule matched and its actions fired |
| `NO_MATCH` | Condition did not match the input |
| `NOT_SELECTED` | Matched but excluded by conflict resolution |
| `BLOCKED_MUTEX` | Blocked by mutex group constraint |
| `LOST_PRIORITY` | Lost to a higher-priority rule |
| `DROPPED_LIMIT` | Execution limit reached |
| `ERROR` | Rule evaluation failed |

### Reading Reason Codes

| Code | Meaning |
|---|---|
| `FINAL_WINNER` | Successfully executed |
| `CONDITION_MISMATCH` | Input facts didn't satisfy the condition |
| `MUTEX_PRIORITY_LOST` | Another rule in the same mutex group had higher priority |
| `MUTEX_LIMIT_REACHED` | Mutex group's max rules already fired |
| `GROUP_LIMIT_REACHED` | Group's `executionLimit` reached |
| `ACTION_ERROR` | Action execution failed (e.g., webhook timeout) |

## 3. Dry Run Compare

Compare how two versions evaluate the same input:

```bash
lexq analytics dry-run-compare --json '{
  "facts": { "payment_amount": 150000, "customer_tier": "VIP" },
  "versionIdA": "<baselineVersionId>",
  "versionIdB": "<candidateVersionId>"
}'
```

Useful for validating that changes in a new version produce expected differences.

## 4. Batch Simulation

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
      "targetVariable": "discount_amount",
      "aggregationType": "SUM"
    }
  }
}'
```

### Dataset Types

| Type | Source | Description |
|---|---|---|
| `HISTORICAL` | `EXECUTION_LOGS` | Replay past executions from a date range |
| `MANUAL` | `REQUEST_BODY` | Provide `manualData` array in the request |
| `UPLOADED` | `S3_BUCKET` | Reference an uploaded dataset by `path` |

### File Upload Dataset
```bash
# 1. Download template (optional)
lexq analytics dataset template \
  --group-id  --version-id  --format csv --output template.csv

# 2. Upload dataset
lexq analytics dataset upload --file ./my-data.csv
# → path: datasets//a1b2c3d4e5f6.csv

# 3. Start simulation with uploaded path
lexq analytics simulation start --json '{
  "policyVersionId": "",
  "dataset": {
    "type": "UPLOADED",
    "source": "S3_BUCKET",
    "path": "datasets//a1b2c3d4e5f6.csv"
  },
  "options": { "includeRuleStats": true, "maxRecords": 10000 }
}'
```

**CSV format:** Header row with fact keys, data rows with values. Types auto-detected.
**JSON format:** Array of objects `[{"key": "value"}, ...]`

### MCP — Dataset Tools

```
lexq_dataset_template  → Get sample CSV/JSON based on version's required facts
lexq_dataset_upload    → Upload inline CSV/JSON content to S3, returns path
```

### Check Status (Poll)

```bash
lexq analytics simulation status --id <simulationId>
```

Simulation is async. Poll until `status` is `COMPLETED` or `FAILED`.

| Status | Meaning |
|---|---|
| `PENDING` | Queued |
| `RUNNING` | In progress (`progress` field shows 0–100) |
| `COMPLETED` | Done — results available |
| `FAILED` | Error occurred |
| `CANCELLED` | Manually cancelled |

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
    "targetVariable": "discount_amount",
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
    { "ruleId": "...", "ruleName": "VIP Discount", "matchedCount": 5000, "metricValue": 3000000 }
  ]
}
```

## Agent Workflow: Validate Before Deploy

```bash
# 1. Check what facts the version needs
lexq analytics requirements --group-id <gid> --version-id <vid>

# 2. Dry-run with representative inputs
lexq analytics dry-run --version-id <vid> --debug --mock --json '{
  "facts": { "payment_amount": 150000, "customer_tier": "VIP" }
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
    "metricConfig": { "targetVariable": "discount_amount", "aggregationType": "SUM" }
  }
}'

# 5. Poll until complete
lexq analytics simulation status --id <simId>

# 6. If results acceptable, deploy
lexq deploy live --group-id <gid> --version-id <newVersionId> --memo "Simulation passed"
```