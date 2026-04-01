# CONTEXT.md — LexQ Platform Architecture

## What is LexQ?

LexQ is a **B2B SaaS policy execution engine**. Customers define business rules (conditions → actions), test them via simulation, deploy to production, and execute via REST API — all without modifying application code.

**Core differentiators:**
- Pre-deploy simulation against real data
- A/B testing for rule versions
- Git-style versioning with full audit trail

## Architecture
```
LexQ CLI ──► api.lexq.io/api/v1/partners (API Key auth)
                     │
                     ▼
              LexQ Policy Engine
```

The CLI exclusively calls the Partner API via API Key authentication.

**Base URL:** `https://api.lexq.io/api/v1/partners`

## Domain Model

```
Tenant
 └── PolicyGroup (ACTIVE | DISABLED | ARCHIVED)
      ├── PolicyVersion (DRAFT → ACTIVE → ARCHIVED | EXPIRED)
      │    └── PolicyRule (condition + actions, priority-ordered)
      ├── PolicyDeployment (PUBLISH | DEPLOY | ROLLBACK | UNDEPLOY)
      └── A/B Test (testVersionId + trafficRate)

Tenant
 └── FactDefinition (key, type, displayName — shared across all groups)

Tenant
 └── Integration (WEBHOOK | COUPON | POINT | NOTIFICATION | CRM | MESSENGER)
```

## Key Enums

### Policy Group Status
| Value | Description |
|---|---|
| `ACTIVE` | Normal operation |
| `DISABLED` | Execution blocked (emergency stop) |
| `ARCHIVED` | Permanently removed |

### Policy Version Status
| Value | Description |
|---|---|
| `DRAFT` | Editable. Rules can be added/modified. |
| `ACTIVE` | Published. Locked — no modifications allowed. |
| `ARCHIVED` | Superseded by a newer version. |
| `EXPIRED` | Past `effectiveTo` date. Auto-transitioned by scheduler. |

### Condition Operators
`EQUALS`, `NOT_EQUALS`, `GREATER_THAN`, `GREATER_THAN_OR_EQUAL`, `LESS_THAN`, `LESS_THAN_OR_EQUAL`, `CONTAINS`, `IN`, `NOT_IN`

### Value Types
`STRING`, `NUMBER`, `BOOLEAN`, `LIST_STRING`, `LIST_NUMBER`

### Action Types
`DISCOUNT`, `POINT`, `COUPON_ISSUE`, `BLOCK`, `NOTIFICATION`, `WEBHOOK`, `SET_FACT`, `ADD_TAG`

### Conflict Resolution Modes
`NONE` (all fire), `EXCLUSIVE` (one winner), `MAX_N` (up to N winners)

### Conflict Resolution Strategies
`FIRST_MATCH`, `HIGHEST_PRIORITY`, `MAX_BENEFIT`

### Deployment Types
`PUBLISH` (DRAFT → ACTIVE), `DEPLOY` (ACTIVE → live traffic), `ROLLBACK` (revert to previous), `UNDEPLOY` (remove from live)

### Execution Statuses
`SUCCESS`, `NO_MATCH`, `ERROR`, `TIMEOUT`

### Simulation Statuses
`PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`

### Decision Statuses
`SELECTED`, `NO_MATCH`, `NOT_SELECTED`, `BLOCKED_MUTEX`, `LOST_PRIORITY`, `DROPPED_LIMIT`, `ERROR`

## Glossary

| Term | Definition |
|---|---|
| **Policy Group** | Top-level container for rule versions. Controls deployment lifecycle, conflict resolution, and A/B testing. |
| **Policy Version** | An immutable snapshot of rules. Only DRAFT versions can be modified. |
| **Policy Rule** | A condition → actions pair. Evaluated in priority order within a version. |
| **Fact** | An input variable passed during execution. Declared via Fact Definitions with key, type, and name. |
| **Fact Definition** | Schema declaration for a fact — its key (snake_case), value type, display name, and description. |
| **Dry Run** | Single-input test execution. Returns which rules matched, what actions would fire, and decision traces. |
| **Simulation** | Batch test replaying historical executions against a version. Compares with a baseline. |
| **Activation Group** | A logical grouping of Policy Groups for cross-group conflict resolution. |
| **Mutex Group** | A logical grouping of Policy Rules within a version for intra-version conflict resolution. |
| **Deployment** | The act of putting an ACTIVE version into production to receive traffic. |
| **Rollback** | Reverting to the previously deployed version. Creates a new deployment record. |
| **Undeploy** | Removing a group from live traffic. No version serves requests until re-deployed. |
| **A/B Test** | Splitting traffic between the current live version and a test version by percentage. |
| **Execution Trace** | Per-rule evaluation result showing whether the condition matched and what actions were generated. |
| **Decision Trace** | Final disposition of a rule after conflict resolution (SELECTED, BLOCKED_MUTEX, etc.). |
| **Snapshot Hash** | SHA-256 hash of a version's rule snapshot at deployment time. Used to verify integrity. |
| **Traffic Rate** | Percentage (0–100) of traffic routed to the A/B test version. |