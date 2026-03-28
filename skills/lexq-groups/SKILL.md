# LexQ CLI — Policy Groups

> **Prerequisite:** Read `lexq-shared/SKILL.md` first.

## Overview

A **Policy Group** is the top-level container. It holds versions (each containing rules), manages deployment state, and controls conflict resolution when multiple groups interact.

## Status Lifecycle

```
ACTIVE ──→ DISABLED (emergency stop, re-enable anytime)
  │              │
  └──→ ARCHIVED ←┘  (permanent, cannot be restored)
```

- **ACTIVE**: Normal operation. Executions are processed.
- **DISABLED**: All executions are blocked. Use for emergency stop. Can re-enable by updating status back to ACTIVE.
- **ARCHIVED**: Permanently removed from execution. Cannot be undone.

## CRUD Commands

### List Groups

```bash
lexq groups list --page 0 --size 20
```

### Get Group Detail

```bash
lexq groups get --id <groupId>
```

Returns full detail including `activationMode`, `activationStrategy`, `executionLimit`, and A/B test state.

### Create Group

```bash
lexq groups create --json '{
  "name": "discount-policy",
  "description": "VIP discount rules",
  "priority": 0,
  "activationMode": "NONE",
  "activationStrategy": "FIRST_MATCH",
  "status": "ACTIVE"
}'
```

**Required fields:** `name`, `priority`

**Optional fields with defaults:**

| Field | Default | Description |
|---|---|---|
| `activationMode` | `NONE` | Conflict resolution mode |
| `activationStrategy` | `FIRST_MATCH` | Strategy within the mode |
| `executionLimit` | `null` | Max rules that can fire |
| `activationGroup` | `null` | Logical group for cross-group conflict resolution |
| `status` | `ACTIVE` | Initial status |

### Update Group

```bash
lexq groups update --id <groupId> --json '{
  "name": "updated-discount-policy",
  "priority": 1
}'
```

Only include fields you want to change. Omitted fields are not modified.

### Delete Group

```bash
lexq groups delete --id <groupId>
# Prompts for confirmation. Use --force to skip.
lexq groups delete --id <groupId> --force
```

**Warning:** Deleting a group cascades — all versions, rules, and deployment history are removed.

## Conflict Resolution

### Activation Mode (across groups in the same `activationGroup`)

| Mode | Behavior |
|---|---|
| `NONE` | All matching rules fire. No conflict resolution. |
| `EXCLUSIVE` | Only one group wins within the activation group. |
| `MAX_N` | Up to `executionLimit` groups can fire. |

### Activation Strategy

| Strategy | Behavior |
|---|---|
| `FIRST_MATCH` | First matching group by priority wins. |
| `HIGHEST_PRIORITY` | Lowest priority number wins (0 = highest). |
| `MAX_BENEFIT` | Group producing the largest action value wins. |

**Constraint:** All groups sharing the same `activationGroup` **must** use identical `activationMode` and `activationStrategy`. The API rejects mismatches with `ACTIVATION_CONFIG_MISMATCH`.

### Example: Exclusive Discount Groups

```bash
# Only one of these can fire per execution
lexq groups create --json '{
  "name": "vip-discount",
  "priority": 0,
  "activationGroup": "discounts",
  "activationMode": "EXCLUSIVE",
  "activationStrategy": "HIGHEST_PRIORITY"
}'

lexq groups create --json '{
  "name": "seasonal-discount",
  "priority": 1,
  "activationGroup": "discounts",
  "activationMode": "EXCLUSIVE",
  "activationStrategy": "HIGHEST_PRIORITY"
}'
```

## A/B Testing

Split traffic between the current live version and a test version.

### Start A/B Test

```bash
lexq groups ab-test start --group-id <groupId> --version-id <publishedVersionId> --traffic-rate 30
```

`--traffic-rate` is the percentage (1–99) of traffic routed to the test version.

### Adjust Traffic

```bash
lexq groups ab-test adjust --group-id <groupId> --traffic-rate 50
```

### Stop A/B Test

```bash
lexq groups ab-test stop --group-id <groupId>
# Prompts for confirmation. Use --force to skip.
lexq groups ab-test stop --group-id <groupId> --force
```

This reverts all traffic to the main version. The test version remains ACTIVE but is no longer receiving traffic.

### A/B Test Workflow

```
1. Create two versions (v1 live, v2 DRAFT with changes)
2. Publish v2: lexq deploy publish --group-id <gid> --version-id <v2id>
3. Start A/B: lexq groups ab-test start --group-id <gid> --version-id <v2id> --traffic-rate 10
4. Monitor: lexq history stats  (compare metrics)
5. Adjust traffic gradually: 10% → 30% → 50% → 100%
6. Promote winner: lexq deploy live --group-id <gid> --version-id <v2id>
7. Stop test: lexq groups ab-test stop --group-id <gid> --force
```

## Common Patterns

### Check Before Creating

Always list existing groups first to avoid duplicates:

```bash
lexq groups list --format json | # parse and check if name exists
lexq groups create --json '...'
```

### Emergency Stop

```bash
lexq groups update --id <groupId> --json '{"status": "DISABLED"}'
```

This immediately stops all executions for the group. No undeploy needed.