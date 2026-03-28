# CLAUDE.md — LexQ CLI

## Project

LexQ CLI (`@lexq/cli`) is a TypeScript CLI for managing the LexQ policy execution engine. It covers the full lifecycle: create groups → define rules → test → deploy → monitor.

## Tech Stack

- **Language:** TypeScript (strict mode, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`)
- **Runtime:** Node.js 18+
- **CLI Framework:** commander
- **Build:** tsup (ESM output)
- **Package Manager:** pnpm
- **Linting:** eslint (flat config, typescript-eslint)

## Repository Structure

```
src/
├── cli.ts              # Command registration
├── index.ts            # Entry point
├── commands/           # 11 command files (auth, groups, versions, rules, facts,
│                       #   deploy, analytics, history, integrations, logs, status)
├── lib/                # Shared utilities
│   ├── api-client.ts   # HTTP client (fetch + API key injection)
│   ├── config.ts       # ~/.lexq/config.json management
│   ├── output.ts       # JSON + table formatters
│   └── errors.ts       # Error handling
└── types/              # TypeScript type definitions (12 files)
    ├── api.ts           # PageResponse, ApiEnvelope
    ├── enums.ts         # All enum types
    ├── auth.ts          # WhoAmIResponse
    ├── groups.ts        # PolicyGroup types
    ├── versions.ts      # PolicyVersion types
    ├── rules.ts         # PolicyRule + ConditionNode + ActionDefinition
    ├── deploy.ts        # Deployment types
    ├── analytics.ts     # DryRun, Simulation, Requirements
    ├── facts.ts         # FactDefinition types
    ├── execution.ts     # ExecutionHistory types
    ├── integrations.ts  # Integration types
    └── logs.ts          # FailureLog types

skills/                 # AI Agent Skills (read-only documentation for agents)
tests/
└── e2e.sh              # E2E test suite (40 cases)
```

## Key Commands

```bash
pnpm build              # Build with tsup
pnpm typecheck          # TypeScript type check (tsc --noEmit)
pnpm lint               # ESLint
pnpm start              # Run CLI (node dist/index.js)
bash tests/e2e.sh       # E2E tests (requires valid API key in ~/.lexq/config.json)
```

## Architecture Principles

1. **Path alias:** `@/` maps to `src/` via tsup esbuildOptions. Never use relative `../` imports across directories.
2. **No `.js` extensions** in imports — tsup handles resolution.
3. **`noUncheckedIndexedAccess`** — every array/object index access needs defensive checks (optional chaining, nullish coalescing, or explicit narrowing).
4. **All commands follow the same pattern:** register function receives `program: Command`, creates a subcommand group, each leaf action does `apiRequest<T>()` → `printJson(data)`.
5. **Types mirror engine DTOs exactly.** Request types use optional fields (`?`), response types use `| null` for nullable fields. Never deviate from the engine's actual response shape.
6. **JSON body input:** Create/update commands accept `--json '<body>'`. Analytics commands also accept `--file <path>`.
7. **Confirmation prompts:** Destructive ops use readline prompt, skippable with `--force`.

## API Conventions

- **Base URL:** `https://api.lexq.io/api/v1/partners`
- **Auth:** `X-API-KEY` header
- **Envelope:** `{ "result": "SUCCESS" | "ERROR", "data": T, "message": string }`
- **Pagination:** `pageNo` / `pageSize` (NOT `page` / `size`). Pages are 0-indexed.
- **Fact keys:** Always `snake_case`, case-sensitive.

## Common Pitfalls

- **Don't add `.js` to imports.** The build system handles this.
- **Don't use `page`/`size` in response types.** Use `pageNo`/`pageSize`.
- **Don't hardcode IDs.** Always parse from previous command output.
- **Don't skip dry-run before publish.** Validate first.
- **Don't modify non-DRAFT versions.** Clone first.

## When Modifying Code

1. Run `pnpm typecheck` after any change — zero errors required.
2. If adding a new command, follow the exact pattern in an existing `commands/*.ts` file.
3. If adding a new type, add it to the corresponding `types/*.ts` file and ensure it matches the engine DTO.
4. Run `bash tests/e2e.sh` for full regression before committing.