# AGENTS.md — LexQ CLI Agent Guide

> **For AI Agents and AI-powered IDEs** (Claude Code, Cursor, Windsurf, Cline, Gemini CLI, Copilot, and others).

## What is this?

LexQ CLI (`@lexq/cli`, binary: `lexq`) manages a policy execution engine. Policies are business rules (if-then) that
evaluate input facts and produce actions (discounts, blocks, notifications, etc.).

The CLI also doubles as an **MCP server** — run `lexq serve --mcp` to expose 62 tools to any MCP-compatible AI client.

This file tells you how to use the CLI as an AI agent.

## Quick Start

```bash
# 1. Install
npm install -g @lexq/cli
# or: npx @lexq/cli

# 2. Authenticate
lexq auth login
# Enter API key when prompted

# 3. Verify
lexq auth whoami
```

## Skills

Detailed documentation lives in the `skills/` directory. **Read the relevant skill before executing commands.**

| Skill          | File                              | What it covers                                                    |
|----------------|-----------------------------------|-------------------------------------------------------------------|
| **Shared**     | `skills/lexq-shared/SKILL.md`     | Core concepts, auth, workflow, error codes. **Read first.**       |
| **Groups**     | `skills/lexq-groups/SKILL.md`     | Policy groups, conflict resolution, A/B testing                   |
| **Rules**      | `skills/lexq-rules/SKILL.md`      | Condition syntax, action types, mutex, examples                   |
| **Simulation** | `skills/lexq-simulation/SKILL.md` | Dry run, batch simulation, compare                                |
| **Execution**  | `skills/lexq-execution/SKILL.md`  | History, stats, failure logs, integrations, webhook subscriptions |
| **Recipes**    | `skills/lexq-recipes/SKILL.md`    | End-to-end workflows (copy-paste ready)                           |

## Agent Rules

1. **Always read `lexq-shared/SKILL.md` before any task.** It contains ordering constraints you must follow.
2. **Always dry-run before publishing.** Run `lexq analytics dry-run` to validate.
3. **Never modify a non-DRAFT version.** Check version status first. Clone if needed.
4. **Always check facts before creating rules.** Run `lexq facts list` to know available keys and types.
5. **Use `--format json` for parsing.** This is the default. Don't change it.
6. **Copy full UUIDs from output.** Never guess or truncate IDs.
7. **Memo is required for all deploy operations.** `publish`, `live`, `rollback`, `undeploy` — every one needs `--memo`.
8. **For deployment lifecycle notifications use webhook subscriptions, not integrations.** Integrations fire on rule
   match; webhook subscriptions fire on platform events (VERSION_PUBLISHED, DEPLOYED, ROLLED_BACK, UNDEPLOYED).
9. **Handle errors gracefully.** Check the error code and follow the action table in `lexq-shared/SKILL.md`.

## Complete Command Inventory (67 commands)

```
lexq auth login|logout|whoami
lexq status
lexq serve --mcp                                              # MCP stdio server mode
lexq groups list|get|create|update|delete
lexq groups ab-test start|stop|adjust
lexq versions list|get|create|update|delete|clone
lexq rules list|get|create|update|delete|reorder|toggle
lexq facts list|create|update|delete|action-metadata
lexq deploy publish|live|rollback|undeploy|history|detail|overview|deployable|diff
lexq analytics dry-run|dry-run-compare|requirements
lexq analytics simulation start|status|list|cancel|export
lexq analytics dataset upload|template
lexq history list|get|stats
lexq integrations list|get|save|delete|config-spec
lexq logs list|get|action|bulk-action
lexq webhook-subscriptions list|get|save|delete|test
```

## Example: Create and Deploy a Policy (Minimal)

```bash
# 1. Create group
GROUP=$(lexq groups create --json '{"name":"my-policy","priority":0}')
GID=$(echo $GROUP | jq -r '.id')

# 2. Create version
VERSION=$(lexq versions create --group-id $GID --json '{"commitMessage":"v1"}')
VID=$(echo $VERSION | jq -r '.id')

# 3. Register fact
lexq facts create --key age --name "User Age" --type NUMBER

# 4. Add rule
lexq rules create --group-id $GID --version-id $VID --json '{
  "name": "Adult Check",
  "priority": 0,
  "condition": {"type":"SINGLE","field":"age","operator":"GREATER_THAN_OR_EQUAL","value":18,"valueType":"NUMBER"},
  "actions": [{"type":"SET_FACT","parameters":{"key":"is_adult","value":"true"}}]
}'

# 5. Test
lexq analytics dry-run --version-id $VID --debug --mock --json '{"facts":{"age":25}}'

# 6. Deploy
lexq deploy publish --group-id $GID --version-id $VID --memo "v1"
lexq deploy live --group-id $GID --version-id $VID --memo "Initial deploy"
```

## Example: Subscribe to Deployment Notifications

Webhook subscriptions fire on platform events — separate from rule-level webhooks.

```bash
# Subscribe to Slack for deployment events
lexq webhook-subscriptions save --json '{
  "name": "Slack Deploy Notifications",
  "webhookUrl": "https://hooks.slack.com/services/XXX/YYY/ZZZ",
  "subscribedEvents": ["VERSION_PUBLISHED", "DEPLOYED", "ROLLED_BACK", "UNDEPLOYED"],
  "payloadFormat": "SLACK"
}'

# Test delivery
lexq webhook-subscriptions test --id <SUBSCRIPTION_ID>
```

## IDE-Specific Notes

### Cursor / Windsurf / Cline

Place this file in the project root. The IDE will auto-discover it.

### Claude Code

See `.claude/CLAUDE.md` for additional project-specific context (code structure, build commands, architecture
principles).

### Gemini CLI

Read this file and the skills directory. All commands are documented with full examples.

### MCP clients (Claude.ai, Claude Desktop, VS Code, etc.)

Connect via:

- **Cloud:** `https://mcp.lexq.io` (OAuth 2.1)
- **Local stdio:** `npx @lexq/cli serve --mcp`

62 tools mirror the CLI command inventory.

## Troubleshooting

| Problem                      | Solution                                                                 |
|------------------------------|--------------------------------------------------------------------------|
| `Not authenticated`          | Run `lexq auth login`                                                    |
| `ENTITY_NOT_FOUND`           | Verify the ID exists via the corresponding `list` command                |
| `CANNOT_MODIFY`              | Version is not DRAFT. Clone it: `lexq versions clone`                    |
| `EMPTY_RULES`                | Add at least one rule before publishing                                  |
| `ACTIVATION_CONFIG_MISMATCH` | All groups in the same activationGroup must share the same mode/strategy |
| `WH_URL_INVALID`             | Webhook URL must be HTTPS and return 2xx for a POST                      |
| Network error                | Check `lexq status` for API health                                       |