# GEMINI.md — LexQ CLI

## Project

LexQ CLI (`@lexq/cli`, binary: `lexq`) is a TypeScript CLI for managing the LexQ policy execution engine. Full lifecycle: create groups → define rules → test → deploy → monitor.

## Getting Started

1. Read `AGENTS.md` in the project root for the universal agent guide.
2. Read `skills/lexq-shared/SKILL.md` for core concepts, auth, and workflow.
3. Reference other skills in `skills/` as needed for specific domains.

## Skills Index

| Skill | File | Coverage |
|---|---|---|
| Shared | `skills/lexq-shared/SKILL.md` | Core concepts, auth, workflow, error codes |
| Groups | `skills/lexq-groups/SKILL.md` | Policy groups, conflict resolution, A/B testing |
| Rules | `skills/lexq-rules/SKILL.md` | Condition syntax, action types, mutex |
| Simulation | `skills/lexq-simulation/SKILL.md` | Dry run, batch simulation, compare |
| Execution | `skills/lexq-execution/SKILL.md` | History, stats, failure logs, integrations |
| Recipes | `skills/lexq-recipes/SKILL.md` | 10 end-to-end workflows |

## Tech Stack

- **Language:** TypeScript (strict, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`)
- **Runtime:** Node.js 18+
- **CLI Framework:** commander
- **Build:** tsup (ESM)
- **Package Manager:** pnpm

## Key Commands

```bash
pnpm build          # Build
pnpm typecheck      # Type check
pnpm lint           # ESLint
bash tests/e2e.sh   # E2E tests
```

## Architecture

```
src/
├── cli.ts           # Command registration
├── commands/        # 11 command files
├── lib/             # api-client, config, output, errors
└── types/           # 12 type definition files
```

All commands follow the same pattern: `apiRequest<T>()` → `printJson(data)`. Types mirror engine DTOs exactly.

## Rules

1. Always use `--format json` (default). Parse output programmatically.
2. Always dry-run before publishing.
3. Never modify non-DRAFT versions — clone first.
4. Check facts (`lexq facts list`) before creating rules.
5. Copy full UUIDs from output — never guess.