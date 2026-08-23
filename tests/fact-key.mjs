#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// LexQ CLI — Fact Key Grammar Test
// ═══════════════════════════════════════════════════════════════
//
// A fact key starts with a letter, then letters, numbers, and underscores. Casing is not
// enforced: the key belongs to whoever writes it, and this client must not be stricter than
// the API it talks to.
//
// Through 0.1.50 the MCP tool schema used a lowercase-only pattern. The API accepted
// `paymentAmount`; this client rejected it before the request left the machine. There was no
// test, so nothing said so. This suite is that test.
//
// It reads the pattern out of the source rather than importing it, so it can also assert
// there is exactly one copy of the literal. A second copy is how the first one drifted.
//
// Usage:
//   node tests/fact-key.mjs
//
// No build, no network, no API key.
// ═══════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
    if (detail) console.log(`       ${DIM}${detail}${NC}`);
  }
}

function read(rel) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
}

const typesSource = read('../src/types/facts.ts');
const mcpSource = read('../src/mcp/tools/facts.ts');

const declaration = typesSource.match(/export const FACT_KEY_PATTERN = (\/.+\/);/);
if (!declaration) {
  console.error(`${RED}FACT_KEY_PATTERN not found in src/types/facts.ts${NC}`);
  process.exit(1);
}
const pattern = new RegExp(declaration[1].slice(1, -1));

console.log('\nFact key grammar\n');

const ACCEPTED = [
  ['paymentAmount', 'camelCase'],
  ['isFirstPurchase', 'camelCase'],
  ['userId', 'camelCase'],
  ['transferAmountUSD', 'trailing acronym'],
  ['payment_amount', 'snake_case stays valid'],
  ['transaction_count_24h', 'snake_case with digits'],
  ['PaymentAmount', 'PascalCase'],
  ['PAYMENT_AMOUNT', 'upper snake'],
  ['a', 'single letter'],
];

const REJECTED = [
  ['1payment', 'leading digit'],
  ['_leading', 'leading underscore is the engine-injected namespace'],
  ['__ctx_channel', 'engine-injected key'],
  ['has space', 'space'],
  ['has-dash', 'dash'],
  ['has.dot', 'dot'],
  ['has(paren', 'paren'],
  ['', 'empty'],
];

for (const [key, why] of ACCEPTED) {
  check(`accepts ${JSON.stringify(key)} (${why})`, pattern.test(key));
}
for (const [key, why] of REJECTED) {
  check(`rejects ${JSON.stringify(key)} (${why})`, !pattern.test(key));
}

// Regression seal. The narrower pattern shipped through 0.1.50 rejected these.
const NARROWER = /\^\[a-z\]\[a-z0-9_\]\*\$/;
for (const key of ['paymentAmount', 'userId', 'PaymentAmount']) {
  check(
    `not narrower than the API for ${JSON.stringify(key)}`,
    pattern.test(key),
    'the pattern went back to lowercase-only',
  );
}

// One copy only. The MCP tool schema must reference the constant.
check(
  'the MCP create tool uses FACT_KEY_PATTERN',
  mcpSource.includes('.regex(FACT_KEY_PATTERN)'),
  'a second copy of the pattern drifts from the first',
);
check(
  'no lowercase-only key pattern in either file',
  !NARROWER.test(typesSource) && !NARROWER.test(mcpSource),
  'found the narrower pattern again',
);

// ── Prose that agents read ────────────────────────────────────────────────
//
// The first version of this suite checked two source files. It passed while AGENTS.md and
// CONTEXT.md — both listed in package.json `files`, both named in README.md as agent read
// paths — still said "Fact keys are `snake_case`". A gate that only guards the code lets the
// instructions drift instead, and the instructions are what an agent acts on.

console.log('\nProse that ships\n');

const DOCS = ['../AGENTS.md', '../CONTEXT.md', '../README.md'];
for (const dir of ['lexq-shared', 'lexq-rules', 'lexq-recipes', 'lexq-execution', 'lexq-groups', 'lexq-simulation']) {
  DOCS.push(`../skills/${dir}/SKILL.md`);
}

// Text that tells the reader a fact key must have a particular casing. `case-sensitive` is
// fine and stays — that is a fact about lookup, not an instruction about naming.
const PRESCRIBES = [
  /fact\s+keys?[^.\n]*\bsnake_case\b/i,
  /\bkeys?\b[^.\n]*\bmust be lowercase\b/i,
  /\bkeys?\b[^.\n]*\blowercase (?:letters|only|with)/i,
  /key \(snake_case\)/i,
];

for (const rel of DOCS) {
  let text;
  try {
    text = read(rel);
  } catch {
    check(`${rel} exists`, false, 'listed here but missing on disk');
    continue;
  }
  const hit = PRESCRIBES.find((re) => re.test(text));
  const line = hit
    ? text.split('\n').findIndex((l) => hit.test(l)) + 1
    : 0;
  check(
    `${rel.replace('../', '')} does not prescribe a casing`,
    !hit,
    hit ? `line ${line}: ${hit}` : undefined,
  );
}

// The narrower pattern must not come back as prose either.
check(
  'no doc spells out the old lowercase-only grammar',
  !DOCS.some((rel) => {
    try {
      return /lowercase letters, numbers, and underscores/i.test(read(rel));
    } catch {
      return false;
    }
  }),
  'a doc restates the pre-0.1.51 rule',
);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
