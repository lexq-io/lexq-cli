# LexQ CLI — Shared Context

> **Read this skill first.** All other LexQ skills assume you have read this document.

## What is LexQ?

LexQ is a **policy execution engine**. Customers define business rules (conditions → actions), deploy them to
production, and execute them via API — all without touching application code. Core differentiators are **pre-deploy
simulation** and **A/B testing** for rule versions.

## Authentication

```bash
# Store your API key (persisted at ~/.lexq/config.json)
lexq auth login
# Enter your API Key: lexq_us_xxxxxxxxxxxxx

# Verify authentication
lexq auth whoami
```

The API key is passed as `X-API-KEY` header on every request. You can also override per-command:

```bash
lexq groups list --api-key lexq_us_override_key
```

**Base URL:** `https://api.lexq.io/api/v1/partners` (default). Override with `--base-url`.

## Core Concepts

| Concept             | Description                                                                                                      | Analogy                |
|---------------------|------------------------------------------------------------------------------------------------------------------|------------------------|
| **Policy Group**    | A container for rule versions. Has a lifecycle status (ACTIVE / DISABLED / ARCHIVED).                            | Git repository         |
| **Policy Version**  | A snapshot of rules within a group. Follows DRAFT → ACTIVE → ARCHIVED lifecycle.                                 | Git branch / commit    |
| **Policy Rule**     | A condition + actions pair within a version. Evaluated in priority order.                                        | if-then statement      |
| **Fact Definition** | Input schema — declares available variables and their types (STRING, NUMBER, BOOLEAN, LIST_STRING, LIST_NUMBER). | Function parameter     |
| **Deployment**      | Promotes an ACTIVE version to live traffic. Supports rollback and scheduled arming.                              | Production release     |
| **Dry Run**         | Tests a single input against a DRAFT or ACTIVE version without side effects.                                     | Unit test              |
| **Simulation**      | Batch-tests a version against historical execution data. Compares with a baseline.                               | Integration test suite |

## Standard Workflow

This is the typical lifecycle. **Always follow this order:**

```
1. lexq groups create          → Create a policy group
2. lexq versions create        → Create a DRAFT version inside it
3. lexq facts create           → Register input variables (if not already defined)
4. lexq rules create           → Add rules with conditions + actions
5. lexq analytics dry-run      → Test with sample facts (validate before publish)
6. lexq deploy publish         → DRAFT → ACTIVE (locks the version)
7. lexq analytics simulation   → Batch-test against historical data with a baseline (optional)
8. lexq deploy live            → Deploy ACTIVE version to production
```

### Critical Ordering Constraints

- **Cannot create rules without a DRAFT version.** Create the version first.
- **Cannot publish without at least one rule.** Add rules before publishing.
  **Cannot modify an ACTIVE version.** Clone it to create a new DRAFT if changes are needed.
- **Cannot deploy a DRAFT version.** Must publish first (DRAFT → ACTIVE).
- **Always run `lexq analytics dry-run` before publishing.** This is your safety net.

## Global Options

Every command accepts these flags:

| Flag                     | Description                                | Default                               |
|--------------------------|--------------------------------------------|---------------------------------------|
| `--format <json\|table>` | Output format                              | `json`                                |
| `--api-key <key>`        | Override stored API key                    | from config                           |
| `--base-url <url>`       | Override API base URL                      | `https://api.lexq.io/api/v1/partners` |
| `--dry-run`              | Preview the HTTP request without executing | off                                   |
| `--verbose`              | Show request/response details              | off                                   |
| `--no-color`             | Disable colored output                     | off                                   |

**Agent best practice:** Always use `--format json` (the default). Parse JSON output programmatically. Use
`--format table` only when displaying to humans.

## Command Groups

| Group                   | Commands                                                                                                                   | Description                     |
|-------------------------|----------------------------------------------------------------------------------------------------------------------------|---------------------------------|
| `auth`                  | `login`, `logout`, `whoami`                                                                                                | Authentication                  |
| `status`                | (root)                                                                                                                     | API health check                |
| `groups`                | `list`, `get`, `create`, `update`, `delete`, `reorder` + `ab-test start\|stop\|adjust`                                     | Policy group CRUD + A/B testing |
| `versions`              | `list`, `get`, `create`, `update`, `delete`, `clone`                                                                       | Version CRUD                    |
| `rules`                 | `list`, `get`, `create`, `update`, `delete`, `reorder`, `toggle`                                                           | Rule CRUD                       |
| `facts`                 | `list`, `create`, `update`, `delete`                                                                                       | Fact definition CRUD            |
| `domain-templates`      | `list`, `preview`, `apply`                                                                                                 | Industry starter packs          |
| `deploy`                | `publish`, `live`, `rollback`, `undeploy`, `history`, `detail`, `overview`, `schedule`, `unschedule`, `schedules`          | Deployment lifecycle            |
| `analytics`             | `dry-run`, `dry-run-compare`, `requirements`, `simulation start\|status\|list\|cancel\|export`, `dataset upload\|template` | Testing & analysis              |
| `profile`               | (root, takes `<groupId>`)                                                                                                  | Per-rule latency profile        |
| `history`               | `list`, `get`, `stats`                                                                                                     | Execution history               |
| `replay`                | `decision`, `start`, `list`, `get`, `cancel`                                                                               | Decision replay                 |
| `provenance`            | `get`, `reveal-audits`                                                                                                     | Decision provenance + PII audit |
| `logs`                  | `list`, `get`, `action`, `bulk-action`                                                                                     | Failure log management          |
| `webhook-subscriptions` | `list`, `get`, `save`, `delete`, `test`                                                                                    | Platform event webhooks         |
| `serve`                 | `--mcp`                                                                                                                    | MCP server over stdio           |

## Pagination

All list endpoints return a `PageResponse`:

```json
{
  "content": [
    ...
  ],
  "totalElements": 42,
  "totalPages": 3,
  "pageNo": 0,
  "pageSize": 20
}
```

Use `--page` and `--size` to paginate. Pages are **0-indexed**.

## Error Handling

API errors return:

```json
{
  "result": "ERROR",
  "message": "Policy version not found.",
  "errorCode": "P-002"
}
```

`errorCode` is a stable identifier of the form `<domain>-<number>`. `message` is the
human-readable explanation and is localized by `Accept-Language`. **Branch on `errorCode`, never
on `message`.**

Prefixes you will encounter through the CLI:

| Prefix | Domain                | Example cause                                  |
|--------|-----------------------|------------------------------------------------|
| `C-`   | Common validation     | Malformed or missing request field             |
| `A-`   | Auth                  | Invalid or missing API key                     |
| `P-`   | Policy group/version  | Not found, wrong lifecycle state, already live |
| `ACT-` | Action parameters     | Missing or invalid action parameter            |
| `FD-`  | Fact definitions      | Duplicate key, system fact immutable           |
| `AN-`  | Analytics             | Dry-run or simulation failure                  |
| `FL-`  | Failure logs          | Log not found                                  |
| `WH-`  | Webhook subscriptions | Invalid URL, delivery failure                  |
| `I-`   | Idempotency           | Duplicate idempotency key                      |

## Important Conventions

1. **Fact keys start with a letter,** then letters, numbers, and underscores. Casing is yours to
   choose and keys are case-sensitive. These docs use `camelCase`: `paymentAmount`, `customerTier`.
2. **IDs are UUIDs.** Always copy the full ID from list/create output — do not guess.
3. **Dates use ISO 8601.** Example: `2025-01-01T00:00:00Z`. Time zone is UTC.
4. **JSON bodies via `--json`.** Most create/update commands accept `--json '<body>'` for the request body.
5. **File input via `--file`.** `analytics dry-run`, `dry-run-compare`, `simulation start` accept
   `--file path/to/body.json` as an alternative to `--json`. `analytics dataset upload` requires
   `--file` (CSV or JSON). `simulation export` and `dataset template` write output with `--output`.
6. **Confirmation prompts.** Destructive operations (delete, cancel, undeploy) prompt for confirmation. Use `--force` to
   skip in automation.

## Skill Formatting

Catalog-style skills (`lexq-recipes`) separate independent items with `---`. Narrative skills do
not use it at all. Never mix both in one file.