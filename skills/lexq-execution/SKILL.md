# LexQ CLI — Execution & Monitoring

> **Prerequisite:** Read `lexq-shared/SKILL.md` first.

## Overview

Once policies are deployed, the engine evaluates incoming facts against live rules. This skill covers **observing**
production behavior: execution history, statistics, failure logs, and deployment state.

## 1. Execution History

### List Executions

```bash
lexq history list --page 0 --size 20
```

Filter options:

| Flag                  | Description            | Example                   |
|-----------------------|------------------------|---------------------------|
| `--trace-id <id>`     | Filter by trace ID     | `--trace-id abc123`       |
| `--group-id <id>`     | Filter by policy group | `--group-id <gid>`        |
| `--version-id <id>`   | Filter by version      | `--version-id <vid>`      |
| `--status <status>`   | Filter by status       | `--status SUCCESS`        |
| `--start-date <date>` | Start date (ISO)       | `--start-date 2025-01-01` |
| `--end-date <date>`   | End date (ISO)         | `--end-date 2025-01-31`   |

### Execution Statuses

| Status     | Meaning                                                                                       |
|------------|-----------------------------------------------------------------------------------------------|
| `SUCCESS`  | At least one rule matched and actions executed                                                |
| `NO_MATCH` | No rules matched — or the version was not evaluated at all (e.g. outside its effective dates) |
| `ERROR`    | Engine error during evaluation                                                                |
| `TIMEOUT`  | Execution exceeded time limit                                                                 |

A version outside its effective date range is filtered before evaluation, so no per-rule trace is produced for it. If a
rule you expect never appears in `decisionTraces`, check the version's `effectiveFrom` / `effectiveTo` with
`lexq versions get`.

### Get Execution Detail

```bash
lexq history get --id <executionId>
```

Returns full detail including `inputFacts`, `executionTraces`, and `decisionTraces`.

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

Failure logs are a dead-letter record for background tasks that failed after the request returned.
Two task types exist:

| Task type              | What failed                                                      |
|------------------------|------------------------------------------------------------------|
| `PLATFORM_WEBHOOK`     | A platform event webhook delivery (`lexq webhook-subscriptions`) |
| `SCHEDULED_DEPLOYMENT` | A scheduled deployment that could not be armed or executed       |

Policy execution failures do **not** land here — they surface in execution history with
status `ERROR`.

### List Failure Logs

```bash
lexq logs list --page 0 --size 20
```

Filter options:

| Flag                  | Description                             | Values                                     |
|-----------------------|-----------------------------------------|--------------------------------------------|
| `--task-type <type>`  | Task type                               | `PLATFORM_WEBHOOK`, `SCHEDULED_DEPLOYMENT` |
| `--status <status>`   | Log status                              | `PENDING`, `RESOLVED`, `IGNORED`           |
| `--keyword <kw>`      | Search in refId, refSubId, errorMessage | any string                                 |
| `--start-date <date>` | Start date (ISO)                        | `2025-01-01`                               |
| `--end-date <date>`   | End date (ISO)                          | `2025-01-31`                               |

### Get Failure Log Detail

```bash
lexq logs get --id <logId>
```

Includes the original payload and error message. Use it to diagnose before marking the log.

### Mark a Log

There is no retry action — the engine does not re-execute a failed task on request. Fix the cause
at the source (webhook endpoint, version state), then mark the log.

```bash
lexq logs action --id <logId> --action RESOLVE   # cause was fixed
lexq logs action --id <logId> --action IGNORE    # does not need fixing
```

Both remove the log from `PENDING`; they differ only in recorded intent.

### Bulk Operations

```bash
lexq logs bulk-action --ids "id1,id2,id3" --action RESOLVE
lexq logs bulk-action --ids "id4,id5" --action IGNORE
```

## 3. Deployment Monitoring

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

### Scheduled Deployment

A version with a future `effectiveFrom` can be armed to deploy itself at that time.

```bash
# Arm — the version must be ACTIVE (published) with a future effective start
lexq deploy schedule --group-id <gid> --version-id <vid> --memo "Q4 pricing"

# List all schedules (PENDING, EXECUTED, CANCELED, FAILED)
lexq deploy schedules --format table

# Cancel the pending schedule (the version itself is untouched)
lexq deploy unschedule --group-id <gid> --force
```

One pending schedule per group. The scheduler deploys within one tick (≤60s) of the effective
start. A manual deploy, rollback, undeploy, A/B test start, or group archive **cancels** the
pending schedule — the cancellation reason is recorded in the schedule ledger.

The snapshot hash is sealed at scheduling time. If the version changes before the effective start,
the scheduled deploy fails with `HASH_MISMATCH` rather than deploying something unexpected.

## 4. Decision Provenance

Every execution is sealed with a `traceId`. Provenance answers "why did this decision happen"
deterministically — which rules fired, which lost, and to what.

```bash
lexq provenance get --trace-id <traceId>
```

Returns the decision, per-rule reason codes (`FINAL_WINNER`, `CONDITION_MISMATCH`, `MUTEX_PRIORITY_LOST`,
`GROUP_LIMIT_REACHED`, …), and the sealed version snapshot hash.

A rule that lost conflict resolution has status `BLOCKED` — unrelated to the `BLOCK` action, which writes the
`isBlocked` fact while its own rule stays `SELECTED`.

### PII Reveal Audit

Facts marked `isPii` are masked on every read surface. Unmasking is possible only in the console
and every reveal is recorded.

```bash
lexq provenance reveal-audits
```

Returns who revealed which fact of which trace, and when.

## 5. Decision Replay

Re-evaluate past executions against a candidate version to see what would have changed.

```bash
# Single decision
lexq replay decision --trace-id <traceId> --version-id <candidateVid>

# A date window, as an async job
lexq replay start --version-id <candidateVid> --from 2025-01-01 --to 2025-01-31
# --max-records caps the sample (hard cap 50k)
lexq replay get --id <jobId>
lexq replay list
lexq replay cancel --id <jobId>
```

Replay reports whether the outcome is `DETERMINISTIC` or `REPLAY_MAY_DIFFER` — the latter when the
original execution depended on values the replay cannot reproduce.

## 6. Latency Profile

Per-rule latency distribution for a policy group.

```bash
lexq profile <groupId>

# Single-rule detail — distributions + 60s window series
lexq profile <groupId> --rule <ruleId>

# Defaults: live version, last 24h, cache HIT
lexq profile <groupId> --version <vid> --cache MISS \
  --from 2026-07-01T00:00:00Z --to 2026-08-01T00:00:00Z
```

`--from` / `--to` are ISO-8601 **instants** here (`2026-07-01T00:00:00Z`), unlike `replay start`
which takes `yyyy-MM-dd` dates.

`p50` / `p95` / `p99` are `null` when the sample is under 100 — the engine reports insufficient
data rather than inventing a number. `n` is always present.

## Agent Monitoring Workflow

```bash
# 1. Check overall health
lexq history stats

# 2. If failure rate is high, investigate
lexq history list --status ERROR --page 0 --size 10

# 3. For a specific bad decision, get the deterministic why
lexq provenance get --trace-id <traceId>

# 4. Check for system failures
lexq logs list --status PENDING --page 0 --size 10

# 5. Inspect and mark
lexq logs get --id <logId>
lexq logs action --id <logId> --action RESOLVE

# 6. Verify deployment integrity
lexq deploy overview
```