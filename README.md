# LexQ CLI

> **The decision platform for engineering teams.**
> CLI and MCP server for [LexQ](https://lexq.io) — move business rules out of
> your deploy pipeline, prove every change with simulation, and ship without
> a git push.

**[Website](https://lexq.io)** · **[Docs](https://docs.lexq.io)** · **[Console](https://console.lexq.io)**

[![npm](https://img.shields.io/npm/v/@lexq/cli)](https://www.npmjs.com/package/@lexq/cli)
[![License](https://img.shields.io/github/license/lexq-io/lexq-cli)](LICENSE)

---

## Why LexQ?

Your business rules — pricing, promotions, fee logic, eligibility checks —
change often. But every change ships through the same PR → review → staging
→ deploy cycle as your core application code. A one-line discount rule
takes two weeks.

This is an architectural problem, not a process problem. Business logic
that changes weekly shouldn't live in code that ships quarterly.

**LexQ separates the two.** Rules live outside your application. You change
them in a visual console or through this CLI. You prove every change with
batch simulation against real execution data. You deploy without touching
your codebase.

Every decision leaves a full audit trace.

## Install

```bash
npm install -g @lexq/cli
```

Or run without installing:

```bash
npx @lexq/cli
```

Requires **Node.js 18+**.

## Quick Start

```bash
# 1. Authenticate
lexq auth login
# Enter your API key (create one at console.lexq.io → Management → API Keys)

# 2. Verify
lexq auth whoami

# 3. Create a policy group
lexq groups create --json '{"name":"my-policy","priority":0}'

# 4. Create a draft version
lexq versions create --group-id <GROUP_ID> --json '{"commitMessage":"v1"}'

# 5. Add a rule
lexq rules create --group-id <GROUP_ID> --version-id <VERSION_ID> --json '{
  "name": "VIP Discount",
  "priority": 0,
  "condition": {
    "type": "SINGLE",
    "field": "customer_tier",
    "operator": "EQUALS",
    "value": "VIP",
    "valueType": "STRING"
  },
  "actions": [{
    "type": "DISCOUNT",
    "parameters": {"method":"PERCENTAGE","rate":10,"refVar":"payment_amount"}
  }]
}'

# 6. Test against your data before shipping
lexq analytics dry-run --version-id <VERSION_ID> --debug --mock \
  --json '{"facts":{"customer_tier":"VIP","payment_amount":100000}}'

# 7. Deploy
lexq deploy publish --group-id <GROUP_ID> --version-id <VERSION_ID> --memo "v1"
lexq deploy live --group-id <GROUP_ID> --version-id <VERSION_ID> --memo "Initial deploy"
```

## For AI Agents — 63 MCP Tools

LexQ is designed to be AI-native. The entire policy engine API — all 63 tools
— is exposed via Model Context Protocol. Claude, Cursor, and other MCP-compatible
agents can create, simulate, and deploy rules autonomously, with human approval
before production.

### Claude.ai (Cloud — no install)

1. **Settings → Connectors → Add Custom Integration**
2. Enter: `https://mcp.lexq.io`
3. Sign in with your LexQ account and select an API key
4. Done — 63 tools available in every conversation

### Remote (Streamable HTTP)

For any MCP client that supports remote servers:

```json
{
  "mcpServers": {
    "lexq": {
      "url": "https://mcp.lexq.io"
    }
  }
}
```

OAuth 2.1 authentication is handled automatically by your client.

### Local (stdio)

Run LexQ CLI as a local MCP server:

```bash
lexq serve --mcp
```

#### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "lexq": {
      "command": "npx",
      "args": [
        "-y",
        "@lexq/cli",
        "serve",
        "--mcp"
      ]
    }
  }
}
```

#### VS Code / Cursor

`.vscode/mcp.json`:

```json
{
  "servers": {
    "lexq": {
      "command": "npx",
      "args": [
        "-y",
        "@lexq/cli",
        "serve",
        "--mcp"
      ]
    }
  }
}
```

> **Prerequisite:** `lexq auth login` must have been run once to store an
> API key in `~/.lexq/config.json`.

## AI Agent Skills

LexQ CLI ships with **AI Agent Skills** — structured documentation agents
read to understand *how* to use the tools, not just *what* they are.

```
skills/
├── lexq-shared/SKILL.md       Core concepts, auth, workflow
├── lexq-groups/SKILL.md       Policy groups, conflict resolution, A/B testing
├── lexq-rules/SKILL.md        Condition syntax, action types, mutex
├── lexq-simulation/SKILL.md   Dry run, batch simulation, compare
├── lexq-execution/SKILL.md    Execution history, stats, failure logs
└── lexq-recipes/SKILL.md      End-to-end recipes

.claude/CLAUDE.md              Claude Code project context
AGENTS.md                      Universal agent guide (Cursor, Windsurf, Gemini CLI, Cline)
CONTEXT.md                     Platform architecture & glossary
```

After installing `@lexq/cli`, agents can read skills from:

```
node_modules/@lexq/cli/skills/
node_modules/@lexq/cli/AGENTS.md
node_modules/@lexq/cli/CONTEXT.md
```

## Commands

```
lexq auth                  login | logout | whoami
lexq status                API health check
lexq serve                 Run as MCP stdio server (--mcp)
lexq groups                list | get | create | update | delete
lexq groups ab-test        start | stop | adjust
lexq versions              list | get | create | update | delete | clone
lexq rules                 list | get | create | update | delete | reorder | toggle
lexq facts                 list | create | update | delete | action-metadata
lexq deploy                publish | live | rollback | undeploy | history | detail | overview | deployable | diff
lexq analytics             dry-run | dry-run-compare | requirements
lexq analytics simulation  start | status | list | cancel | export
lexq analytics dataset     upload | template
lexq history               list | get | stats
lexq integrations          list | get | save | delete | config-spec
lexq logs                  list | get | action | bulk-action
lexq webhook-subscriptions list | get | save | delete | test
```

## Global Options

| Flag                     | Description                                |
|--------------------------|--------------------------------------------|
| `--format <json\|table>` | Output format (default: `json`)            |
| `--api-key <key>`        | Override stored API key                    |
| `--base-url <url>`       | Override API base URL                      |
| `--dry-run`              | Preview the HTTP request without executing |
| `--verbose`              | Show request/response details              |
| `--no-color`             | Disable colored output                     |

## Configuration

Config is stored at `~/.lexq/config.json`:

```json
{
  "apiKey": "YOUR_API_KEY",
  "baseUrl": "https://api.lexq.io/api/v1/partners",
  "format": "json"
}
```

## Development

```bash
git clone https://github.com/lexq-io/lexq-cli.git
cd lexq-cli
pnpm install
pnpm build
pnpm start -- groups list
```

```bash
pnpm typecheck                  # Type check
pnpm lint                       # ESLint
bash tests/e2e.sh               # CLI E2E tests (requires API key)
bash tests/test-engine-api.sh   # Engine API integration tests
```

## License

[Apache-2.0](LICENSE)