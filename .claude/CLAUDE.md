# CLAUDE.md — LexQ CLI

## Project

LexQ CLI (`@lexq/cli`) is a TypeScript CLI for managing the LexQ policy execution engine. It covers the full lifecycle:
define facts → create groups → author rules → simulate → deploy → monitor → notify.

The same binary also runs as an **MCP server** (`lexq serve --mcp`), exposing 63 tools to MCP-compatible AI clients via
stdio.

## Tech Stack

- **Language:** TypeScript (strict mode, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`)
- **Runtime:** Node.js 18+
- **CLI Framework:** commander
- **MCP SDK:** `@modelcontextprotocol/sdk` (stdio transport)
- **Build:** tsup (ESM output, dual entry: CLI binary + MCP library)
- **Package Manager:** pnpm
- **Linting:** eslint (flat config, typescript-eslint)
- **Formatting:** dedent for multi-line string literals (CLI help text + MCP descriptions)

## Repository Structure

```
src/
├── cli.ts                 # Command registration
├── index.ts               # Entry point
├── commands/              # 13 command files
│   ├── auth.ts
│   ├── status.ts
│   ├── serve.ts           # `lexq serve --mcp` (stdio MCP server)
│   ├── groups.ts
│   ├── versions.ts
│   ├── rules.ts
│   ├── facts.ts
│   ├── deploy.ts
│   ├── analytics.ts
│   ├── history.ts
│   ├── integrations.ts
│   ├── logs.ts
│   └── webhook-subscriptions.ts
├── lib/                   # Shared utilities
│   ├── api-client.ts      # HTTP client (fetch + API key injection)
│   ├── config.ts          # ~/.lexq/config.json management
│   ├── output.ts          # JSON + table formatters
│   └── errors.ts          # Error handling
├── mcp/                   # MCP server mode (stdio + HTTP library)
│   ├── register.ts        # registerAllTools() — registers all 63 tools
│   └── tools/             # Tool definitions by domain
│       ├── _shared.ts     # CallApi abstraction, createCallApiFromConfig()
│       ├── status.ts
│       ├── groups.ts
│       ├── versions.ts
│       ├── rules.ts
│       ├── facts.ts
│       ├── deploy.ts
│       ├── analytics.ts
│       ├── history.ts
│       ├── integrations.ts
│       ├── logs.ts
│       └── webhook-subscriptions.ts
└── types/                 # TypeScript type definitions (13 files)
    ├── api.ts                    # PageResponse, ApiEnvelope
    ├── enums.ts                  # All enum types (incl. PlatformEventType)
    ├── auth.ts                   # WhoAmIResponse
    ├── groups.ts
    ├── versions.ts
    ├── rules.ts                  # ConditionNode + ActionDefinition
    ├── deploy.ts
    ├── analytics.ts              # DryRun, Simulation, Requirements
    ├── facts.ts
    ├── execution.ts              # ExecutionHistory types
    ├── integrations.ts
    ├── logs.ts
    └── webhook-subscriptions.ts

skills/                    # AI Agent Skills (read-only docs for agents)
tests/
├── e2e.sh                 # CLI E2E test suite
└── test-engine-api.sh     # Engine API integration tests (execution endpoints)
```

## Key Commands

```bash
pnpm build                      # Build with tsup (produces dist/index.js + dist/mcp/)
pnpm typecheck                  # TypeScript type check (tsc --noEmit)
pnpm lint                       # ESLint (0 warnings policy)
pnpm start                      # Run CLI (node dist/index.js)
bash tests/e2e.sh               # CLI E2E — requires API key in ~/.lexq/config.json
bash tests/test-engine-api.sh   # Engine API integration — requires deployed tenant
```

## Architecture Principles

1. **Path alias:** `@/` maps to `src/` via tsup esbuildOptions. Never use relative `../` imports across directories.
2. **No `.js` extensions** in imports — tsup handles resolution.
3. **`noUncheckedIndexedAccess`** — every array/object index access needs defensive checks (optional chaining, nullish
   coalescing, or explicit narrowing).
4. **CLI commands follow a uniform pattern:** register function receives `program: Command`, creates a subcommand group,
   each leaf action does `apiRequest<T>()` → `printJson(data)`.
5. **MCP tools share the same api-client layer** via the `CallApi` abstraction in `src/mcp/tools/_shared.ts`. CLI (stdio
   mode) uses `createCallApiFromConfig()` which reads `~/.lexq/config.json`; the HTTP server (`lexq-mcp` separate repo)
   injects a Bearer-token-based caller.
6. **Types mirror engine DTOs exactly.** Request types use optional fields (`?`), response types use `| null` for
   nullable fields. Never deviate from the engine's actual response shape.
7. **JSON body input:** Create/update commands accept `--json '<body>'`. Analytics commands also accept `--file <path>`.
8. **Multi-line strings:** Use `dedent` tagged templates for CLI `addHelpText` and MCP tool `description` fields. Never
   rely on template literal indentation.
9. **Confirmation prompts:** Destructive ops use readline prompt, skippable with `--force`.

## API Conventions

- **Base URL:** `https://api.lexq.io/api/v1/partners`
- **Auth:** `X-API-KEY` header
- **Envelope:** `{ "result": "SUCCESS" | "ERROR", "data": T, "message": string }`
- **Pagination:** `pageNo` / `pageSize` (NOT `page` / `size`). Pages are 0-indexed.
- **Fact keys:** Always `snake_case`, case-sensitive.

## Feature Domains

Two distinct webhook concepts — do not conflate them:

| Feature                        | Fires on                           | Configured at   | Command group                |
|--------------------------------|------------------------------------|-----------------|------------------------------|
| **Integration** (WEBHOOK type) | Rule match during execution        | Per-rule action | `lexq integrations`          |
| **Webhook Subscription**       | Platform events (deploy lifecycle) | Per-tenant      | `lexq webhook-subscriptions` |

## Common Pitfalls

- **Don't add `.js` to imports.** The build system handles this.
- **Don't use `page`/`size` in response types.** Use `pageNo`/`pageSize`.
- **Don't hardcode IDs.** Always parse from previous command output.
- **Don't skip dry-run before publish.** Validate first.
- **Don't modify non-DRAFT versions.** Clone first.
- **Don't confuse Integrations and WebhookSubscriptions.** See the table above.
- **Don't use template literal indentation in MCP descriptions.** Use `dedent` — indentation leaks into the LLM context.
- **Don't forget `--memo`** on deploy operations. All four (publish/live/rollback/undeploy) require it.

## When Modifying Code

1. Run `pnpm typecheck` after any change — zero errors required.
2. If adding a new command, follow the exact pattern in an existing `commands/*.ts` file.
3. If adding a new MCP tool, add it to the corresponding `mcp/tools/*.ts` file, register in `mcp/register.ts`, and
   update the tool count in comments.
4. If adding a new type, add it to the corresponding `types/*.ts` file and ensure it matches the engine DTO.
5. If adding a new command, mirror it as an MCP tool — CLI and MCP should stay in lock-step.
6. Run `bash tests/e2e.sh` for full regression before committing.
7. For engine-facing changes, also run `bash tests/test-engine-api.sh`.