# GEMINI.md — LexQ CLI

## Project

LexQ CLI (`@lexq/cli`, binary: `lexq`) is a TypeScript CLI for managing the LexQ policy execution engine. Full
lifecycle: define facts → create groups → author rules → simulate → deploy → monitor → notify.

Also runs as an **MCP server** (`lexq serve --mcp`) exposing 63 tools to any MCP-compatible AI client.

## Getting Started

1. Read `AGENTS.md` in the project root for the universal agent guide.
2. Read `skills/lexq-shared/SKILL.md` for core concepts, auth, and workflow.
3. Reference other skills in `skills/` as needed for specific domains.

## Skills Index

| Skill      | File                              | Coverage                                                          |
|------------|-----------------------------------|-------------------------------------------------------------------|
| Shared     | `skills/lexq-shared/SKILL.md`     | Core concepts, auth, workflow, error codes                        |
| Groups     | `skills/lexq-groups/SKILL.md`     | Policy groups, conflict resolution, A/B testing                   |
| Rules      | `skills/lexq-rules/SKILL.md`      | Condition syntax, action types, mutex                             |
| Simulation | `skills/lexq-simulation/SKILL.md` | Dry run, batch simulation, compare                                |
| Execution  | `skills/lexq-execution/SKILL.md`  | History, stats, failure logs, integrations, webhook subscriptions |
| Recipes    | `skills/lexq-recipes/SKILL.md`    | End-to-end workflows                                              |

## Tech Stack

- **Language:** TypeScript (strict, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`)
- **Runtime:** Node.js 18+
- **CLI Framework:** commander
- **MCP SDK:** `@modelcontextprotocol/sdk` (stdio mode)
- **Build:** tsup (ESM, dual entry: CLI binary + MCP library)
- **Package Manager:** pnpm

## Key Commands

```bash
pnpm build                 # Build (produces dist/index.js + dist/mcp/)
pnpm typecheck             # Type check
pnpm lint                  # ESLint (0 warnings policy)
bash tests/e2e.sh          # E2E tests (requires API key)
bash tests/test-engine-api.sh   # Engine API integration tests
```

## Architecture

```
src/
├── cli.ts                 # Command registration
├── commands/              # 13 command files (auth, status, serve, groups,
│                          # versions, rules, facts, deploy, analytics,
│                          # history, integrations, logs, webhook-subscriptions)
├── lib/                   # api-client, config, output, errors
├── mcp/                   # MCP server mode
│   ├── register.ts        # registers all 63 tools
│   └── tools/             # tool definitions by domain (11 files + _shared)
└── types/                 # type definitions (13 files)
```

Two surfaces, one core:

- **CLI:** `apiRequest<T>()` → `printJson(data)`
- **MCP:** tools share the same api-client layer via the `CallApi` abstraction

Types mirror engine DTOs exactly.

## Rules

1. Always use `--format json` (default). Parse output programmatically.
2. Always dry-run before publishing (`lexq analytics dry-run`).
3. Never modify non-DRAFT versions — clone first (`lexq versions clone`).
4. Check facts (`lexq facts list`) before creating rules.
5. Copy full UUIDs from output — never guess or truncate.
6. Memo is required for all deploy operations (publish, live, rollback, undeploy).
7. For deployment lifecycle notifications, register webhook subscriptions — not integrations. Integrations fire on rule
   match; webhook subscriptions fire on platform events (VERSION_PUBLISHED, DEPLOYED, ROLLED_BACK, UNDEPLOYED).