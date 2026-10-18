#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// LexQ CLI — Fact Update Flags Test
// ═══════════════════════════════════════════════════════════════
//
// `lexq facts update` sends only the fields whose flags were passed. This suite reads the
// request body out of `--dry-run`, so it never touches the network.
//
// `--pii` and `--no-pii` were declared but never reached the body: commander stores the pair
// under `pii`, and the body was built from `isPii`. The CLI left both flags out of the request
// without saying so.
//
// Usage:
//   pnpm build && node tests/fact-update.mjs
// ═══════════════════════════════════════════════════════════════

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../dist/index.js', import.meta.url));

const GREEN = '\x1b[0;32m';
const RED = '\x1b[0;31m';
const DIM = '\x1b[2m';
const NC = '\x1b[0m';

let pass = 0;
let fail = 0;

function check(name, ok, detail) {
  if (ok) {
    pass += 1;
    console.log(`  ${GREEN}PASS${NC} ${name}`);
  } else {
    fail += 1;
    console.log(`  ${RED}FAIL${NC} ${name}`);
    if (detail) console.log(`       ${RED}→ ${detail}${NC}`);
  }
}

if (!existsSync(CLI)) {
  console.error(`\n  ${RED}dist/index.js is missing — run pnpm build first${NC}\n`);
  process.exit(1);
}

const UUID = '11111111-1111-1111-1111-111111111111';

/** The body `lexq facts update` would send, or `null` when none was printed. */
function body(flags) {
  const r = spawnSync(
    process.execPath,
    [CLI, '--dry-run', '--api-key', 'test', 'facts', 'update', '--id', UUID, ...flags],
    { encoding: 'utf8' },
  );
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const start = out.indexOf('{');
  const end = out.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(out.slice(start, end + 1));
  } catch {
    return null;
  }
}

console.log(`\n${DIM}  Fact update flags${NC}\n`);

// ── PII ────────────────────────────────────────────────────────
const pii = body(['--pii']);
check('--pii sends isPii: true', pii?.isPii === true, JSON.stringify(pii));

const noPii = body(['--no-pii']);
check('--no-pii sends isPii: false', noPii?.isPii === false, JSON.stringify(noPii));

// ── Required, the other flag pair ──────────────────────────────
const noRequired = body(['--no-required']);
check(
  '--no-required sends isRequired: false',
  noRequired?.isRequired === false,
  JSON.stringify(noRequired),
);

// ── Fields without a flag stay out of the body ─────────────────
const nameOnly = body(['--name', 'Renamed']);
check(
  'without the flags, isPii, isRequired and description are not sent',
  nameOnly !== null &&
    nameOnly.name === 'Renamed' &&
    !('isPii' in nameOnly) &&
    !('isRequired' in nameOnly) &&
    !('description' in nameOnly),
  JSON.stringify(nameOnly),
);

check(
  'without --name, name is not sent',
  pii !== null && !('name' in pii),
  JSON.stringify(pii),
);

// ── Removing the description ───────────────────────────────────
const cleared = body(['--description', '']);
check(
  '--description "" sends an empty string',
  cleared !== null && cleared.description === '',
  JSON.stringify(cleared),
);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
