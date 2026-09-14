#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// LexQ CLI — Value Domain Flags Test
// ═══════════════════════════════════════════════════════════════
//
// `--allowed-values`, `--min`, and `--max` say which values a fact accepts. The flags only
// build a request body, so this suite reads that body out of `--dry-run` and never touches
// the network.
//
// Two things are easy to get wrong and both are checked here.
//
// 1. Digits. `Number()` folds a literal past double precision, and the fold is silent. A lower
//    bound of 123456789012345678901234567890.5 must arrive with every digit intact. The
//    assertion is made against the raw text, because parsing the output back would perform
//    the very rounding under test.
//
// 2. Three states on update. Leaving the flags out keeps the existing constraint; passing
//    `--clear-value-domain` sends `{}`, which removes it. A client that collapsed these into
//    two would make the constraint impossible to remove.
//
// Usage:
//   pnpm build && node tests/value-domain.mjs
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

/** Run the CLI without sending anything and hand back what it printed. */
function run(args) {
  const r = spawnSync(process.execPath, [CLI, '--dry-run', '--api-key', 'test', ...args], {
    encoding: 'utf8',
  });
  return `${r.stdout ?? ''}${r.stderr ?? ''}`;
}

/** The request body as raw text — never parsed, so digits stay as printed. */
function bodyText(args) {
  const out = run(args);
  const start = out.indexOf('{');
  const end = out.lastIndexOf('}');
  return start === -1 || end === -1 ? '' : out.slice(start, end + 1);
}

function body(args) {
  const text = bodyText(args);
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

console.log(`\n${DIM}  Value domain flags${NC}\n`);

// ── Numeric bounds ─────────────────────────────────────────────
const bounds = body([
  'facts',
  'create',
  '--key',
  'riskScore',
  '--name',
  'Risk',
  '--type',
  'NUMBER',
  '--min',
  '0',
  '--max',
  '100',
]);
check(
  '--min and --max become numbers',
  bounds?.valueDomain?.min === 0 && bounds?.valueDomain?.max === 100,
  JSON.stringify(bounds?.valueDomain),
);

// ── Digits survive ─────────────────────────────────────────────
// Asserted on the text. Parsing it back would round the value and hide the bug.
const BIG = '123456789012345678901234567890.5';
const bigText = bodyText([
  'facts',
  'create',
  '--key',
  'riskScore',
  '--name',
  'Risk',
  '--type',
  'NUMBER',
  '--min',
  BIG,
]);
check(
  'a bound past double precision keeps every digit',
  bigText.includes(BIG),
  `expected ${BIG} in the body`,
);

// ── Allowed values follow the declared type ────────────────────
const strings = body([
  'facts',
  'create',
  '--key',
  'tier',
  '--name',
  'Tier',
  '--type',
  'STRING',
  '--allowed-values',
  'GOLD, SILVER, BRONZE',
]);
check(
  'STRING allowed values stay strings',
  JSON.stringify(strings?.valueDomain?.allowedValues) === '["GOLD","SILVER","BRONZE"]',
  JSON.stringify(strings?.valueDomain),
);

const numbers = body([
  'facts',
  'create',
  '--key',
  'score',
  '--name',
  'Score',
  '--type',
  'NUMBER',
  '--allowed-values',
  '10, 20, 30',
]);
check(
  'NUMBER allowed values become numbers',
  JSON.stringify(numbers?.valueDomain?.allowedValues) === '[10,20,30]',
  JSON.stringify(numbers?.valueDomain),
);

// ── No flags, no field ─────────────────────────────────────────
const plain = body([
  'facts',
  'create',
  '--key',
  'plain',
  '--name',
  'Plain',
  '--type',
  'STRING',
]);
check(
  'no flags means no valueDomain at all',
  plain !== null && !('valueDomain' in plain),
  JSON.stringify(plain),
);

// ── Update keeps three states ──────────────────────────────────
const untouched = body(['facts', 'update', '--id', UUID, '--name', 'Renamed']);
check(
  'update without the flags leaves the constraint alone',
  untouched !== null && !('valueDomain' in untouched),
  JSON.stringify(untouched),
);

const cleared = body(['facts', 'update', '--id', UUID, '--clear-value-domain']);
check(
  '--clear-value-domain sends an empty object',
  cleared !== null &&
    'valueDomain' in cleared &&
    JSON.stringify(cleared.valueDomain) === '{}',
  JSON.stringify(cleared),
);

// ── Bad input is refused before the request is built ───────────
check(
  'a non-numeric bound is refused',
  run(['facts', 'create', '--key', 'r', '--name', 'R', '--type', 'NUMBER', '--min', 'abc']).includes(
    '--min must be a number',
  ),
  'expected a message naming --min',
);

check(
  'clearing and setting at once is refused',
  run(['facts', 'update', '--id', UUID, '--clear-value-domain', '--min', '0']).includes(
    'cannot be combined',
  ),
  'expected a message about combining flags',
);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
