#!/usr/bin/env node
/**
 * check-ab-key.mjs — keeps the A/B traffic identity key stated where callers and agents read it.
 *
 * Why a gate and not just prose:
 *   A/B routing splits traffic by one value on the execution request, `context.trafficKey`, and
 *   omitting it is not an error. No request is assigned to the test version, the test still
 *   reports as running, and execution logs keep accumulating — nothing in the response indicates
 *   a problem. These skills and tool descriptions are where an agent learns the contract, and
 *   prose that nothing watches drifts back out on the next rewrite.
 *
 * What is checked:
 *   Each surface below must state `context.trafficKey`. Zero matches is a failure, not a pass —
 *   a gate that silently stops looking still prints OK.
 *
 * Counted per file rather than tree-wide. One surface keeping the wording alive would otherwise
 * mask every other surface losing it.
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

const KEY = /context\.trafficKey/g;

let violations = 0;
const fail = (msg, lines = []) => {
  console.error(`✗ ${msg}`);
  for (const l of lines) console.error(`  ${l}`);
  violations++;
};

for (const { file, label } of REQUIRED) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) {
    fail(`${label}: ${file} is missing`, ['Update REQUIRED in this script if the file moved.']);
    continue;
  }
  const hits = (fs.readFileSync(full, 'utf8').match(KEY) || []).length;
  if (hits === 0) {
    fail(`${label} never states context.trafficKey`, [
      'Without this key an A/B test routes 0% to the test version and reports no error.',
      `Restore the wording in ${file}, or drop the entry here if the surface is gone.`,
    ]);
  } else {
    console.log(`✓ ${label} — ${hits} mention(s)`);
  }
}

if (violations > 0) {
  console.error(`\n${violations} violation(s).`);
  process.exit(1);
}
console.log('\nA/B identity key contract intact.');
