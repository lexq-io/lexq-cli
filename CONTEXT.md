# CONTEXT.md — LexQ Platform Architecture

## What is LexQ?

LexQ is a **B2B SaaS policy execution engine**. Customers define business rules (conditions → actions), test them via
simulation, deploy to production, and execute via REST API — all without modifying application code.

**Core differentiators:**

- Impact Simulation against real data
- A/B testing for rule versions
- Git-style versioning with full audit trail
- Platform event webhooks for deployment lifecycle notifications
- Decision Replay — re-evaluate past decisions against a candidate version
- Decision Provenance — deterministic "why" for every recorded decision

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Clients                                            │
│  • LexQ CLI      (@lexq/cli — API Key auth)         │
│  • MCP clients   (mcp.lexq.io — OAuth 2.1)          │
│  • Console       (console.lexq.io — web UI)         │
│  • Direct HTTP   (api.lexq.io — API Key)            │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
              api.lexq.io (ALB, path-routed)
                         │
          ┌──────────────┴──────────────┐
          ▼                             ▼
   /api/v1/partners            /api/v1/execution
   (policy management)         (real-time rule eval)
          │                             │
          └──────────────┬──────────────┘
                         ▼
                  LexQ Policy Engine
```

The CLI exclusively calls the Partner API. Execution requests (runtime rule evaluation) use a separate path-routed
endpoint.

**Partner Base URL:** `https://api.lexq.io/api/v1/partners`
**Execution Base URL:** `https://api.lexq.io/api/v1/execution`

## Domain Model

```
Tenant
 ├── PolicyGroup (ACTIVE | DISABLED | ARCHIVED)
 │    ├── PolicyVersion (DRAFT → ACTIVE → ARCHIVED | EXPIRED)
 │    │    └── PolicyRule (condition + actions, priority-ordered)
 │    ├── PolicyDeployment (DEPLOY | ROLLBACK | UNDEPLOY)
 │    └── A/B Test (testVersionId + trafficRate)
 │
 ├── FactDefinition (key, type, displayName — shared across all groups)
 │
 └── WebhookSubscription (subscribedEvents + webhookUrl + payloadFormat)
      — fires on platform events (deployment lifecycle)
```

## Key Enums

### Policy Group Status

| Value      | Description                        |
|------------|------------------------------------|
| `ACTIVE`   | Normal operation                   |
| `DISABLED` | Execution blocked (emergency stop) |
| `ARCHIVED` | Permanently removed                |

### Policy Version Status

| Value      | Description                                              |
|------------|----------------------------------------------------------|
| `DRAFT`    | Editable. Rules can be added/modified.                   |
| `ACTIVE`   | Published. Locked — no modifications allowed.            |
| `ARCHIVED` | Superseded by a newer version.                           |
| `EXPIRED`  | Past `effectiveTo` date. Auto-transitioned by scheduler. |

### Condition Operators

`EQUALS`, `NOT_EQUALS`, `GREATER_THAN`, `GREATER_THAN_OR_EQUAL`, `LESS_THAN`, `LESS_THAN_OR_EQUAL`, `CONTAINS`, `IN`,
`NOT_IN`, `HAS_ANY`, `HAS_ALL`, `HAS_NONE`

`HAS_*` are for LIST-typed facts only. `IN` / `NOT_IN` are their mirror — scalar fact, list value.

### Value Types

`STRING`, `NUMBER`, `BOOLEAN`, `LIST_STRING`, `LIST_NUMBER`

### Action Types

`MUTATE_FACT`, `SET_FACT`, `BLOCK`

### Conflict Resolution Modes

`NONE` (all fire), `EXCLUSIVE` (one winner), `MAX_N` (up to N winners)

### Conflict Resolution Strategies

`HIGHEST_PRIORITY`

### Deployment Types

`DEPLOY` (ACTIVE → live traffic), `ROLLBACK` (revert to previous), `UNDEPLOY` (remove from live)

Publishing (DRAFT → ACTIVE) is a qualification event, not a deployment — it has no `DeploymentType`.

### Execution Statuses

`SUCCESS`, `NO_MATCH`, `ERROR`, `TIMEOUT`

### Simulation Statuses

`PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELED`

### Decision Statuses

`SELECTED`, `NO_MATCH`, `BLOCKED`, `ERROR`

`BLOCKED` means the rule matched but lost conflict resolution — the round and reason are in `reasonCode` (
`MUTEX_PRIORITY_LOST`, `GROUP_LIMIT_REACHED`, …). It is unrelated to the `BLOCK` action, whose rule stays `SELECTED`.

`NOT_SELECTED` exists in the enum but the engine never produces it (reserved for effective-date filtering, not yet
implemented).

### Platform Event Types (for webhook subscriptions)

`VERSION_PUBLISHED`, `DEPLOYED`, `ROLLED_BACK`, `UNDEPLOYED`, `DEPLOY_SCHEDULED`, `DEPLOY_SCHEDULE_CANCELED`

### Webhook Payload Formats

`GENERIC` (full JSON payload), `SLACK` (`{"text": "..."}` simplified)

## Glossary

| Term                     | Definition                                                                                                                                                     |
|--------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Policy Group**         | Top-level container for rule versions. Controls deployment lifecycle, conflict resolution, and A/B testing.                                                    |
| **Policy Version**       | An immutable snapshot of rules. Only DRAFT versions can be modified.                                                                                           |
| **Policy Rule**          | A condition → actions pair. Evaluated in priority order within a version.                                                                                      |
| **Fact**                 | An input variable passed during execution. Declared via Fact Definitions with key, type, and name.                                                             |
| **Fact Definition**      | Schema declaration for a fact — its key (snake_case), value type, display name, and description.                                                               |
| **Dry Run**              | Single-input test execution. Returns which rules matched, what actions would fire, and decision traces.                                                        |
| **Simulation**           | Batch test replaying historical executions against a version. Compares with a baseline.                                                                        |
| **Activation Group**     | A logical grouping of Policy Groups for cross-group conflict resolution.                                                                                       |
| **Mutex Group**          | A logical grouping of Policy Rules within a version for intra-version conflict resolution.                                                                     |
| **Deployment**           | The act of putting an ACTIVE version into production to receive traffic.                                                                                       |
| **Rollback**             | Reverting to the previously deployed version. Creates a new deployment record.                                                                                 |
| **Undeploy**             | Removing a group from live traffic. No version serves requests until re-deployed.                                                                              |
| **A/B Test**             | Splitting traffic between the current live version and a test version by percentage.                                                                           |
| **Execution Trace**      | Per-rule evaluation result showing whether the condition matched and what actions were generated.                                                              |
| **Decision Trace**       | Final disposition of a rule after conflict resolution (`SELECTED`, `BLOCKED`, …), with a `reasonCode` explaining why.                                          |
| **Snapshot Hash**        | SHA-256 hash of a version's rule snapshot at deployment time. Used to verify integrity.                                                                        |
| **Traffic Rate**         | Percentage (1–99) of traffic routed to the A/B test version.                                                                                                   |
| **Webhook Subscription** | A platform event listener — receives notifications on deployment lifecycle events. Tenant-level.                                                               |
| **Platform Event**       | A lifecycle event emitted by the engine itself (`VERSION_PUBLISHED`, `DEPLOYED`, `ROLLED_BACK`, `UNDEPLOYED`, `DEPLOY_SCHEDULED`, `DEPLOY_SCHEDULE_CANCELED`). |
| **Failure Log**          | A record of a background task failure (platform webhook delivery, scheduled deployment). Mark as `RESOLVE` or `IGNORE` — there is no retry.                    |