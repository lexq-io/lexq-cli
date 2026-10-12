# LexQ CLI

> **The Decision Operations Platform for engineering teams.**
> CLI and MCP server for [LexQ](https://lexq.io). Move business rules out of
> your deploy pipeline, prove every change with Impact Simulation, and ship without
> a git push.

**[Website](https://lexq.io)** · **[Docs](https://docs.lexq.io)** · **[Console](https://console.lexq.io)** · **[MCP Registry](https://registry.modelcontextprotocol.io)**

[![npm](https://img.shields.io/npm/v/@lexq/cli)](https://www.npmjs.com/package/@lexq/cli)
[![License](https://img.shields.io/github/license/lexq-io/lexq-cli)](LICENSE)

---

## Why LexQ?

Your business rules, such as pricing, promotions, fee logic, and eligibility
checks, change often. But every change ships through the same PR → review →
staging → deploy cycle as your core application code, so even a small change
waits for the next release.

**LexQ keeps those rules out of your code.** Your service calls the LexQ API to
evaluate them. You change rules in a visual console or through this CLI, test
each change with Impact Simulation against past executions or a dataset you
upload, and deploy them without an application release.

Every decision leaves a full audit trail.

## Install

```bash
npm install -g @lexq/cli
```

Or run without installing:

```bash
npx @lexq/cli
```

Requires **Node.js 22+**.

## Quick Start

```bash
# 1. Authenticate
lexq auth login
# Enter your API key (create one with the Manage scope at console.lexq.io → Management → API Keys)

# 2. Verify
lexq auth whoami

# 3. Start from a domain template — provisions facts, sample rules, and a policy group
lexq domain-templates list
lexq domain-templates apply --template ECOMMERCE
# Returns: policyGroupId, policyVersionId, factsCreated, rulesCreated

# 4. Test a rule against your data before shipping
lexq analytics dry-run --version-id <VERSION_ID> --debug \
  --json '{"facts":{"loyaltyTier":"PLATINUM","purchaseSubtotalUsd":150}}'

# 5. Deploy
lexq deploy publish --group-id <GROUP_ID> --version-id <VERSION_ID> --memo "v1"
lexq deploy live --group-id <GROUP_ID> --version-id <VERSION_ID> --memo "Initial deploy"
```

## For AI Agents

Claude, Cursor, and other MCP-compatible agents can use the Model Context
Protocol to manage policy groups, versions, rules, and facts, run simulations
and replays, deploy versions, and read execution history.

Approval happens in your MCP client, which decides which tool calls you confirm.
The deploy, rollback, and undeploy tools are marked as destructive, so a client
can ask you before running them.

### Claude.ai (cloud, no install)

1. **Customize → Connectors → + Add → Add custom connector**
2. Name it, enter `https://mcp.lexq.io`, and choose **Sign in now**
3. On the LexQ page that opens, sign in and generate a new API key for MCP, or choose **I already have an API key** and paste an existing one
4. The tools are now available in every conversation

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
> API key in `~/.lexq/config.json`, or `LEXQ_API_KEY` must be set in the client's
> environment block.

### Registry

The server is listed on the official MCP Registry as **`io.lexq/lexq`**. Clients that
browse the registry find both the npm package and the hosted endpoint in that one entry.

## Protocol Support

The local stdio server and the hosted Streamable HTTP endpoint both serve two MCP
revisions from one set of tool definitions, so a client sees the same tools either way.

| Revision | How a client reaches it |
|----------|-------------------------|
| `2026-07-28` | A per-request `_meta` envelope. No handshake. |
| `2025-11-25` | The `initialize` handshake. |

There is nothing to configure. The server answers in whichever revision the opening message
used, so a client can move to 2026-07-28 on its own schedule and one that has not moved
keeps working.

## AI Agent Skills

LexQ CLI ships with **AI Agent Skills**: structured documentation that tells
agents *how* to use each tool.

```
skills/
├── lexq-shared/SKILL.md       Core concepts, auth, workflow
├── lexq-groups/SKILL.md       Policy groups, conflict resolution, A/B testing
├── lexq-rules/SKILL.md        Condition syntax, action types, mutex
├── lexq-simulation/SKILL.md   Dry run, Impact Simulation, compare
├── lexq-execution/SKILL.md    History, stats, failure logs, provenance, replay, latency profile
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
lexq groups                list | get | create | update | delete | reorder
lexq groups ab-test        start | stop | adjust
lexq versions              list | get | create | update | delete | clone
lexq rules                 list | get | create | update | delete | reorder | toggle
lexq facts                 list | create | update | delete | action-metadata | unregistered
lexq domain-templates      list | preview | apply
lexq deploy                publish | live | rollback | undeploy | history | detail | overview | deployable | diff | schedule | unschedule | schedules
lexq analytics             dry-run | dry-run-compare | requirements
lexq analytics simulation  start | status | list | cancel | export
lexq analytics dataset     upload | template
lexq profile               <groupId> — per-rule latency profile
lexq history               list | get | stats
lexq replay                decision | start | list | get | cancel
lexq logs                  list | get | action | bulk-action
lexq provenance            get | reveal-audits
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

The file holds an API key in plain text. It is saved with mode `0600` inside a `0700`
directory, so only its owner can read it. If an older version created it with looser
permissions, the CLI tightens them the next time it saves the file.

### Environment variables

These are read by the MCP server (`lexq serve --mcp`) and take precedence over the stored
config. They let an editor or CI target an environment through the client's own config block,
without writing to `~/.lexq/config.json`. CLI commands use `--api-key` and `--base-url` instead.

| Variable | Overrides |
|----------|-----------|
| `LEXQ_API_KEY` | `apiKey` |
| `PARTNER_BASE_URL` | `baseUrl` |

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
pnpm build                      # Bundle to dist/
```

Checks that guard a stated fact against the thing that owns it. All of them run in CI.

```bash
pnpm enums:check                # Generated enums match the engine contract
pnpm prose:check                # Numbers and code tables in prose match the contract
pnpm ab-key:check               # Tool descriptions still name the A/B traffic key
pnpm surface:check              # Nothing internal reached a public file
pnpm registry:check             # server.json agrees with package.json and src/mcp/server-info.json
pnpm schemas:check              # tools/list matches the recorded snapshot (needs a build)
pnpm test:fact-key              # Fact key grammar
pnpm test:decimals              # Metric precision display
pnpm test:export-format         # Export byte fidelity
pnpm protocol:check             # README matches the revisions the server serves
```

## Security

Report a vulnerability through
[GitHub's private reporting form](https://github.com/lexq-io/lexq-cli/security/advisories/new).
The policy, including what is in scope, is in
[SECURITY.md](https://github.com/lexq-io/lexq-cli/blob/main/SECURITY.md).

## License

[Apache-2.0](LICENSE)