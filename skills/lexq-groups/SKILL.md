# LexQ CLI — Policy Groups

> **Prerequisite:** Read `lexq-shared/SKILL.md` first.

## Overview

A **Policy Group** is the top-level container. It holds versions (each containing rules), manages deployment state, and
controls conflict resolution when multiple groups interact.

## Status Lifecycle

| From       | To         | Reversible                        |
|------------|------------|-----------------------------------|
| `ACTIVE`   | `DISABLED` | yes — set status back to `ACTIVE` |
| `DISABLED` | `ACTIVE`   | —                                 |
| `ACTIVE`   | `ARCHIVED` | **no**                            |
| `DISABLED` | `ARCHIVED` | **no**                            |

- **ACTIVE** — executions are processed.
- **DISABLED** — all executions are blocked. Use for emergency stop.
- **ARCHIVED** — removed from execution. Reached only through `lexq groups delete`, not by setting `status` directly.

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
  "activationMode": "NONE",
  "activationStrategy": "HIGHEST_PRIORITY",
  "status": "ACTIVE"
}'
```

**Required field:** `name`

`priority` is assigned by the server, not by you — new groups are appended last. Change the order
with `lexq groups reorder`. Priorities are 1-based (1 is highest).

**Optional fields with defaults:**

| Field                | Default            | Description                                        |
|----------------------|--------------------|----------------------------------------------------|
| `activationMode`     | `NONE`             | Conflict resolution mode                           |
| `activationStrategy` | `HIGHEST_PRIORITY` | Strategy within the mode. Currently the only value |
| `executionLimit`     | `null`             | Max rules that can fire                            |
| `activationGroup`    | `null`             | Logical group for cross-group conflict resolution  |
| `status`             | `ACTIVE`           | Initial status                                     |

### Update Group

```bash
lexq groups update --id <groupId> --json '{
  "name": "updated-discount-policy",
  "description": "Updated description"
}'
```

Only include fields you want to change. Omitted fields are not modified.

### Reorder Groups

Priorities are **tenant-wide**, not per activation group. Pass group IDs in desired order; the
server assigns 1, 2, 3, … (1…N continuous):

```bash
lexq groups reorder --group-ids "<gid_A>,<gid_B>,<gid_C>"
```

`activationGroup` is not affected — reorder changes priority only.

### Delete Group

```bash
lexq groups delete --id <groupId>
# Prompts for confirmation. Use --force to skip.
lexq groups delete --id <groupId> --force
```

**`delete` archives — it does not erase.** The group becomes `ARCHIVED` and stops executing;
versions, rules, and history are retained for audit. Deleting an already-archived group is a
no-op.

Two conditions block it:

| Condition              | What to do first                                    |
|------------------------|-----------------------------------------------------|
| The group is deployed  | `lexq deploy undeploy --group-id <gid>`             |
| An A/B test is running | `lexq groups ab-test stop --group-id <gid> --force` |

Archiving cancels any pending scheduled deployment and closes the priority gap — remaining groups
are renumbered 1…N.

## Conflict Resolution

### Activation Mode (across groups in the same `activationGroup`)

| Mode        | Behavior                                                           |
|-------------|--------------------------------------------------------------------|
| `NONE`      | All matching rules fire. No conflict resolution.                   |
| `EXCLUSIVE` | Only one group wins within the activation group.                   |
| `MAX_N`     | Up to `executionLimit` groups fire. Omit it and the server sets 2. |

### Activation Strategy

| Strategy           | Behavior                                                                 |
|--------------------|--------------------------------------------------------------------------|
| `HIGHEST_PRIORITY` | Lowest priority number wins (1 is highest). Currently the only strategy. |

**Constraint:** All groups sharing the same `activationGroup` **must** use identical
`activationMode` and `activationStrategy`. The API rejects mismatches with a `P-` error.

Groups are selected by the order you set, not by comparing action values. `FIRST_MATCH` and
`MAX_BENEFIT` were removed on 2026-08-01 — the former resolved identically to
`HIGHEST_PRIORITY` (candidates are evaluated in priority order, so "first match" *is* "lowest
priority number"), and the latter compared post-action values as scores, which made a 20%
discount lose to a 10% discount. The engine cannot know which direction is "better" for your
domain.

### Example: Exclusive Discount Groups

```bash
# Only one of these can fire per execution
lexq groups create --json '{
  "name": "vip-discount",
  "activationGroup": "discounts",
  "activationMode": "EXCLUSIVE",
  "activationStrategy": "HIGHEST_PRIORITY"
}'

lexq groups create --json '{
  "name": "seasonal-discount",
  "activationGroup": "discounts",
  "activationMode": "EXCLUSIVE",
  "activationStrategy": "HIGHEST_PRIORITY"
}'

# Groups are appended in creation order. Set it explicitly if it matters:
#   lexq groups reorder --group-ids "<vipGid>,<seasonalGid>"
```

## A/B Testing

Split traffic between the current live version and a test version.

### Start A/B Test

```bash
lexq groups ab-test start --group-id <groupId> --version-id <activeVersionId> --traffic-rate 30
```

`--traffic-rate` is the percentage (1–99) of traffic routed to the test version.

The test version must be `ACTIVE` (published) and different from the live version. Starting a test cancels any pending
scheduled deployment for the group.

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
5. Adjust traffic gradually: 10% → 30% → 50%
6. Promote winner: lexq deploy live --group-id <gid> --version-id <v2id>
7. Stop test: lexq groups ab-test stop --group-id <gid> --force
```

## Common Patterns

### Check Before Creating

Always list existing groups first to avoid duplicates:

```bash
lexq groups list --size 100
lexq groups create --json '{"name": "discount-policy"}'
```

Group names are unique per tenant — a duplicate is rejected, not silently created. Listing first
lets you reuse the existing group instead of handling the error.

### Emergency Stop

```bash
lexq groups update --id <groupId> --json '{"status": "DISABLED"}'
```

This immediately stops all executions for the group. No undeploy needed.