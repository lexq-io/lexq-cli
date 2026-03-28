# LexQ CLI

> Manage policies, simulate rules, and deploy from the terminal. Built for humans and AI agents.

[![npm](https://img.shields.io/npm/v/@lexq/cli)](https://www.npmjs.com/package/@lexq/cli)
[![License](https://img.shields.io/github/license/lexq-io/lexq-cli)](LICENSE)

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
    "parameters": {"method":"PERCENTAGE","rate":10,"referenceFactKey":"payment_amount"}
  }]
}'

# 6. Test
lexq analytics dry-run --version-id <VERSION_ID> --debug --mock \
  --json '{"facts":{"customer_tier":"VIP","payment_amount":100000}}'

# 7. Deploy
lexq deploy publish --group-id <GROUP_ID> --version-id <VERSION_ID> --memo "v1"
lexq deploy live --group-id <GROUP_ID> --version-id <VERSION_ID> --memo "Initial deploy"
```

## Commands

```
lexq auth            login | logout | whoami
lexq status          API health check
lexq groups          list | get | create | update | delete
lexq groups ab-test  start | stop | adjust
lexq versions        list | get | create | update | delete | clone
lexq rules           list | get | create | update | delete | reorder | toggle
lexq facts           list | create | update | delete
lexq deploy          publish | live | rollback | undeploy | history | detail | overview
lexq analytics       dry-run | dry-run-compare | requirements
lexq analytics simulation  start | status | list | cancel | export
lexq history         list | get | stats
lexq integrations    list | get | save | delete | config-spec
lexq logs            list | get | action | bulk-action
```

## Global Options

| Flag | Description |
|---|---|
| `--format <json\|table>` | Output format (default: `json`) |
| `--api-key <key>` | Override stored API key |
| `--base-url <url>` | Override API base URL |
| `--dry-run` | Preview the HTTP request without executing |
| `--verbose` | Show request/response details |
| `--no-color` | Disable colored output |

## AI Agent Skills

LexQ CLI ships with **AI Agent Skills** — structured documentation that AI coding agents can read to autonomously manage policies.

```
skills/
├── lexq-shared/SKILL.md       Core concepts, auth, workflow
├── lexq-groups/SKILL.md       Policy groups, conflict resolution, A/B testing
├── lexq-rules/SKILL.md        Condition syntax, action types, mutex
├── lexq-simulation/SKILL.md   Dry run, batch simulation, compare
├── lexq-execution/SKILL.md    Execution history, stats, failure logs
└── lexq-recipes/SKILL.md      10 end-to-end recipes

.claude/CLAUDE.md              Claude Code project context
AGENTS.md                      Universal agent guide (Cursor, Windsurf, Gemini CLI, Cline)
CONTEXT.md                     Platform architecture & glossary
```

### For AI Agent Developers

Skills are included in the npm package. After installing `@lexq/cli`, agents can read skills from:

```
node_modules/@lexq/cli/skills/
node_modules/@lexq/cli/AGENTS.md
node_modules/@lexq/cli/CONTEXT.md
```

Or reference them directly in your project by copying the `skills/` directory.

## Configuration

Config is stored at `~/.lexq/config.json`:

```json
{
  "apiKey": "lxk_xxxxxxxxxxxxx",
  "baseUrl": "https://api.lexq.io/api/v1/partners",
  "format": "json"
}
```

## Development

```bash
git clone https://github.com/sanghyunp-dev/lexq-cli.git
cd lexq-cli
pnpm install
pnpm build
pnpm start -- groups list
```

```bash
pnpm typecheck     # Type check
pnpm lint          # ESLint
bash tests/e2e.sh  # E2E tests (requires API key)
```

## License

[Apache-2.0](LICENSE)