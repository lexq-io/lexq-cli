# LexQ CLI — Execution & Monitoring

> **Prerequisite:** Read `lexq-shared/SKILL.md` first.

## Overview

Once policies are deployed, the engine evaluates incoming facts against live rules. This skill covers **observing** production behavior: execution history, statistics, failure logs, and integrations.

## 1. Execution History

### List Executions

```bash
lexq history list --page 0 --size 20
```

Filter options:

| Flag | Description | Example |
|---|---|---|
| `--trace-id <id>` | Filter by trace ID | `--trace-id abc123` |
| `--group-id <id>` | Filter by policy group | `--group-id <gid>` |
| `--version-id <id>` | Filter by version | `--version-id <vid>` |
| `--status <status>` | Filter by status | `--status SUCCESS` |
| `--start-date <date>` | Start date (ISO) | `--start-date 2025-01-01` |
| `--end-date <date>` | End date (ISO) | `--end-date 2025-01-31` |

### Execution Statuses

| Status | Meaning |
|---|---|
| `SUCCESS` | At least one rule matched and actions executed |
| `NO_MATCH` | No rules matched the input facts |
| `ERROR` | Engine error during evaluation |
| `TIMEOUT` | Execution exceeded time limit |

### Get Execution Detail

```bash
lexq history get --id <executionId>
```

Returns full detail including `requestFacts`, `resultTraces`, and `decisionTraces`.

### Execution Statistics

```bash
lexq history stats
```

Returns KPI summary:

```json
{
  "totalExecutions": 150000,
  "successCount": 142500,
  "noMatchCount": 5000,
  "failureCount": 2500,
  "successRate": 0.95,
  "avgLatencyMs": 8.5
}
```

Use stats to monitor:
- **Success rate** — should be close to 1.0 for well-configured policies
- **Average latency** — should be single-digit ms under normal load
- **No-match count** — high values may indicate missing rules or incomplete fact definitions

## 2. Failure Logs

System failure logs capture errors from background tasks (batch jobs, webhook calls, scheduled operations).

### List Failure Logs

```bash
lexq logs list --page 0 --size 20
```

Filter options:

| Flag | Description | Values |
|---|---|---|
| `--category <cat>` | Task category | `INTEGRATION`, `INTERNAL` |
| `--task-type <type>` | Task type | `COUPON_ISSUE`, `POINT_EARN`, `NOTIFICATION_SEND`, `WEBHOOK_EXECUTE` |
| `--status <status>` | Log status | `PENDING`, `RESOLVED`, `IGNORED` |
| `--keyword <kw>` | Search in refId, refSubId, errorMessage | any string |
| `--start-date <date>` | Start date (ISO) | `2025-01-01` |
| `--end-date <date>` | End date (ISO) | `2025-01-31` |

### Get Failure Log Detail

```bash
lexq logs get --id <logId>
```

### Retry Failed Log

```bash
lexq logs action --id <logId> --action RETRY
```

### Resolve (Mark as Handled)

```bash
lexq logs action --id <logId> --action RESOLVE
```

### Ignore (Skip Retries)

```bash
lexq logs action --id <logId> --action IGNORE
```

### Bulk Operations

```bash
lexq logs bulk-action --ids "id1,id2,id3" --action RETRY
lexq logs bulk-action --ids "id1,id2,id3" --action RESOLVE
```

## 3. Integrations

Integrations connect LexQ actions to external systems (webhooks, CRM, notification services).

### List Integrations

```bash
lexq integrations list --page 0 --size 10
```

### Get Integration

```bash
lexq integrations get --id <integrationId>
```

### Get Config Spec

Shows available integration types and their required configuration fields:

```bash
lexq integrations config-spec
```

### Save (Create or Update)

```bash
lexq integrations save --json '{
  "type": "WEBHOOK",
  "name": "Order Webhook",
  "baseUrl": "https://api.example.com/webhook",
  "isActive": true
}'
```

Integration types: `COUPON`, `POINT`, `NOTIFICATION`, `CRM`, `MESSENGER`, `WEBHOOK`

### Delete Integration

```bash
lexq integrations delete --id <integrationId>
lexq integrations delete --id <integrationId> --force
```

## 4. Deployment Monitoring

### Deployment Overview

See all groups' deployment status at a glance:

```bash
lexq deploy overview
```

Returns an array with each group's current version, last deployment type, and deployer.

### Deployment History

```bash
lexq deploy history --page 0 --size 20
lexq deploy history --group-id <gid>
lexq deploy history --types DEPLOY,ROLLBACK --start-date 2025-01-01
```

### Deployment Detail

```bash
lexq deploy detail --id <deploymentId>
```

Includes snapshot hash verification (`hashValid` field) to detect if a version was modified after deployment.

## Agent Monitoring Workflow

```bash
# 1. Check overall health
lexq history stats

# 2. If failure rate is high, investigate
lexq history list --status ERROR --page 0 --size 10

# 3. Check for system failures
lexq logs list --status PENDING --page 0 --size 10

# 4. Retry or resolve failures
lexq logs action --id <logId> --action RETRY
lexq logs action --id <logId> --action RESOLVE

# 5. Verify deployment integrity
lexq deploy overview
```