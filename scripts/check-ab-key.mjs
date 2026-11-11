#!/usr/bin/env node
/**
 * check-ab-key.mjs — keeps the A/B traffic identity key stated where callers and agents read it.
 *
 * A/B routing splits traffic by one value on the execution request, `contexts.trafficKey`.
 * Omitting it is not an error. The response looks normal, the test still reports as running,
 * and execution logs keep accumulating, but no request is ever assigned to the test version.
 * The skills and tool descriptions in REQUIRED are where an agent learns the contract. Without
 * this check, a later rewrite could drop the key from them and nothing would fail.
 *
 * What is checked:
 *   Each surface in REQUIRED must state `contexts.trafficKey` at least once. A file with zero
 *   matches fails the run, so a KEY pattern that stops matching makes the run fail rather than
 *   report OK.
 *
 *   No shipped text may match STALE. A request that puts a value in an old name is rejected
 *   with C-001 (400).
 *
 * REQUIRED is counted per file rather than tree-wide, so one surface that keeps the wording
 * cannot hide another that lost it.
 *
 * Usage:  node scripts/check-ab-key.mjs
 * Exit:   0 = ok, 1 = violation. Wired into CI.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Surfaces that must carry the contract. Each is counted on its own. */
const REQUIRED = [
  { file: 'skills/lexq-groups/SKILL.md', label: 'groups skill' },
  { file: 'src/mcp/tools/groups.ts', label: 'ab-test start tool description' },
];

const KEY = /contexts\.trafficKey/g;

/**
 * Old names, in the forms this check matches: `context.trafficKey`, a `"context":` JSON key, and
 * the batch field `sharedContext`. The server rejects them with C-001 (400) when they carry a
 * value. It accepts one that is empty or null, but shipped text must not show an old name either
 * way.
 */
const STALE = [/\bcontext\.trafficKey/, /"context"\s*:/, /\bsharedContext\b/];

/** Everything this package ships as prose or tool text. */
const SCAN_DIRS = ['skills', 'src'];
const SCAN_FILES = ['CONTEXT.md', 'AGENTS.md', 'README.md'];
const SCAN_EXT = new Set(['.md', '.ts']);

let violations = 0;
const fail = (msg, lines = []) => {
  console.error(`✗ ${msg}`);
  for (const l of lines) console.error(`  ${l}`);
  violations++;
};

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, acc);
    else if (SCAN_EXT.has(path.extname(full))) acc.push(full);
  }
  return acc;
}

for (const { file, label } of REQUIRED) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) {
    fail(`${label}: ${file} is missing`, ['Update REQUIRED in this script if the file moved.']);
    continue;
  }
  const hits = (fs.readFileSync(full, 'utf8').match(KEY) || []).length;
  if (hits === 0) {
    fail(`${label} never states contexts.trafficKey`, [
      'Without this key an A/B test routes 0% to the test version and reports no error.',
      `Restore the wording in ${file}, or drop the entry here if the surface is gone.`,
    ]);
  } else {
    console.log(`✓ ${label} — ${hits} mention(s)`);
  }
}

const files = [
  ...SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d))),
  ...SCAN_FILES.map((f) => path.join(ROOT, f)).filter((f) => fs.existsSync(f)),
];
if (files.length === 0) {
  fail('found no files to scan for stale names', ['Update SCAN_DIRS if the tree moved.']);
}
let staleFiles = 0;
for (const full of files) {
  const rel = path.relative(ROOT, full);
  const hits = fs
    .readFileSync(full, 'utf8')
    .split('\n')
    .flatMap((line, i) =>
      STALE.some((re) => re.test(line)) ? [`${rel}:${i + 1}: ${line.trim()}`] : [],
    );
  if (hits.length > 0) {
    staleFiles++;
    fail(`${rel} uses an old field name`, [
      ...hits,
      'Use contexts, with the key at contexts.trafficKey. A value in an old name is rejected with C-001 (400).',
    ]);
  }
}
if (files.length > 0 && staleFiles === 0) {
  console.log(`✓ no stale names in ${files.length} files`);
}

if (violations > 0) {
  console.error(`\n${violations} violation(s).`);
  process.exit(1);
}
console.log('\nA/B identity key contract intact.');
