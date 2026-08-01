# CLAUDE.md — LexQ CLI

## Project

LexQ CLI (`@lexq/cli`) is a TypeScript CLI for managing the LexQ policy execution engine. It covers the full lifecycle:
define facts → create groups → author rules → simulate → deploy → monitor → notify.

The same binary also runs as an **MCP server** (`lexq serve --mcp`), exposing 75 tools to MCP-compatible AI clients via
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
├── commands/              # CLI command groups
│   ├── auth.ts
│   ├── status.ts
│   ├── serve.ts           # `lexq serve --mcp` (stdio MCP server)
│   ├── groups.ts
│   ├── versions.ts
│   ├── rules.ts
│   ├── facts.ts
│   ├── domain-templates.ts
│   ├── deploy.ts
│   ├── analytics.ts
│   ├── profile.ts         # per-rule latency profile (§28)
│   ├── history.ts
│   ├── replay.ts          # decision replay (§11)
│   ├── provenance.ts      # decision provenance + PII reveal audit
│   ├── logs.ts
│   └── webhook-subscriptions.ts
├── lib/                   # Shared utilities
│   ├── api-client.ts      # HTTP client (fetch + API key injection)
│   ├── config.ts          # ~/.lexq/config.json management
│   ├── output.ts          # JSON + table formatters
│   └── errors.ts          # Error handling
├── mcp/                   # MCP server mode (stdio + HTTP library)
│   ├── register.ts        # registerAllTools() — 75 tools
│   └── tools/             # Tool definitions by domain
│       ├── _shared.ts     # CallApi abstraction, createCallApiFromConfig()
│       ├── status.ts
│       ├── groups.ts
│       ├── versions.ts
│       ├── rules.ts
│       ├── facts.ts
│       ├── domain-templates.ts
│       ├── deploy.ts
│       ├── analytics.ts
│       ├── profile.ts
│       ├── history.ts
│       ├── replay.ts
│       ├── provenance.ts
│       ├── logs.ts
│       └── webhook-subscriptions.ts
└── types/                 # TypeScript type definitions
    ├── api.ts                    # PageResponse, ApiEnvelope
    ├── enums.ts                  # All enum types
    ├── auth.ts                   # WhoAmIResponse
    ├── groups.ts
    ├── versions.ts
    ├── rules.ts                  # ConditionNode + ActionDefinition
    ├── facts.ts
    ├── domain-templates.ts
    ├── deploy.ts
    ├── analytics.ts              # DryRun, Simulation, Requirements
    ├── profile.ts
    ├── history.ts                # ExecutionHistory types
    ├── replay.ts
    ├── provenance.ts
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
   nullable fields. Never deviate from the engine's actual response shape. `knip` ignores `src/types/**`, so unused type
   files are not detected — check by hand when removing a feature.
7. **JSON body input:** Create/update commands accept `--json '<body>'`. Analytics commands also accept `--file <path>`.
8. **Multi-line strings:** Use `dedent` tagged templates for CLI `addHelpText` and MCP tool `description` fields. Never
   rely on template literal indentation.
9. **Confirmation prompts:** Destructive ops use readline prompt, skippable with `--force`.

## API Conventions

- **Base URL:** `https://api.lexq.io/api/v1/partners`
- **Auth:** `X-API-KEY` header
- **Envelope:** `{ "result": "SUCCESS" | "ERROR", "data": T, "message": string }`
- **Pagination:** request uses `page` / `size` (CLI flags `--page` / `--size`); the response envelope returns `pageNo` /
  `pageSize`. Pages are 0-indexed.
- **Fact keys:** Always `snake_case`, case-sensitive.

## Feature Domains

**Actions never call external systems.** The engine mutates facts and records decisions; the caller reads the result and
acts on it. Platform event webhooks (`lexq webhook-subscriptions`) are the one push channel, and they fire on deployment
lifecycle events — not on rule matches.

## Common Pitfalls

- **Don't add `.js` to imports.** The build system handles this.
- **Response types use `pageNo`/`pageSize`; request params use `page`/`size`.** Don't mix them.
- **Don't hardcode IDs.** Always parse from previous command output.
- **Don't skip dry-run before publish.** Validate first.
- **Don't modify non-DRAFT versions.** Clone first.
- **Don't expect actions to call out.** There is no webhook/coupon/notification action. Read the decision from the
  response.
- **Don't use template literal indentation in MCP descriptions.** Use `dedent` — indentation leaks into the LLM context.
- **Don't forget `--memo`** on deploy operations. All four (publish/live/rollback/undeploy) require it.

## When Modifying Code

1. Run `pnpm typecheck` after any change — zero errors required.
2. If adding a new command, follow the exact pattern in an existing `commands/*.ts` file.
3. If adding a new MCP tool, add it to the corresponding `mcp/tools/*.ts` file and register in `mcp/register.ts`.
   `lexq-mcp` shares this build output — a schema change there requires redeploying that repo (CONVENTIONS §35.1). CI
   does not catch it.
4. If adding a new type, add it to the corresponding `types/*.ts` file and ensure it matches the engine DTO.
5. If adding a new command, mirror it as an MCP tool — CLI and MCP should stay in lock-step.
6. Run `bash tests/e2e.sh` for full regression before committing.
7. For engine-facing changes, also run `bash tests/test-engine-api.sh`.