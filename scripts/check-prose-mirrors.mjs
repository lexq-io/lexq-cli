#!/usr/bin/env node
/**
 * check-prose-mirrors.mjs — verifies the engine facts this package restates in prose
 * against the contract manifest. Two kinds: numbers, and enum values.
 *
 * Why this exists separately from gen-enums:
 *   Code can import a constant and the compiler keeps it honest. Prose cannot. Skill docs,
 *   CONTEXT.md and code comments state the same bounds as plain text, and this package
 *   ships all of them (package.json `files` carries dist, skills, AGENTS.md, CONTEXT.md).
 *   Before this gate those numbers were typed by hand with nothing to catch a drift.
 *
 *   The enum axis was added after a table of status codes kept a name the server had
 *   removed and missed the one that replaced it. The values belong to the server; the
 *   sentence next to each one is this package's own writing. So the set is checked and the
 *   wording is left alone.
 *
 * What is checked:
 *   Number mismatch — the prose states a number the engine no longer holds.
 *   Table drift     — a table listed in ENUM_TABLES holds a value the manifest dropped, or
 *                     is missing one it added.
 *   Zero matches    — the wording changed and the pattern stopped seeing anything. That is
 *                     not a pass. A gate that silently stops looking is worse than no gate,
 *                     because the output still says OK.
 *
 * What is NOT checked:
 *   Constants the code consumes by import. Those are the compiler's job, and a pattern for
 *   them would find nothing and fail the zero-match rule for the wrong reason.
 *
 *   Enum values written outside a table in ENUM_TABLES. Some prose names a subset on
 *   purpose, so completeness is opt-in per table rather than repo-wide.
 *
 * Usage:  node scripts/check-prose-mirrors.mjs
 * Exit:   0 = ok, 1 = violation. Wired into CI.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI_MANIFEST = path.join(ROOT, 'contracts/lexq-manifest.cli.json');

/**
 * Where prose states an engine number, and how to read it back.
 *
 * `expected` turns the engine value into what the prose should say — the CLI writes some
 * of these in a friendlier unit than the engine holds them in. The engine keeps its own
 * unit; the conversion belongs to the side doing the mirroring.
 */
const PROSE_MIRRORS = [
  {
    constant: 'MAX_ROUNDING_SCALE',
    label: 'rounding scale bound',
    pattern: /scale:\s*0\.\.(\d+)/g,
    expected: (v) => String(v),
  },
  {
    constant: 'MAX_TRAFFIC_RATE',
    label: 'A/B traffic rate upper bound',
    pattern: /[Pp]ercentage\s*\(\d+[-–](\d+)\)/g,
    expected: (v) => String(v),
  },
  {
    constant: 'MIN_TRAFFIC_RATE',
    label: 'A/B traffic rate lower bound',
    pattern: /[Pp]ercentage\s*\((\d+)[-–]\d+\)/g,
    expected: (v) => String(v),
  },
  {
    constant: 'REPLAY_WINDOW_MAX_RECORDS',
    label: 'window replay hard cap',
    pattern: /hard cap (\d+)k/g,
    expected: (v) => String(v / 1000),
  },
  {
    constant: 'LATENCY_WINDOW_MILLIS',
    label: 'latency window length',
    pattern: /(\d+)s window/g,
    expected: (v) => String(v / 1000),
  },
  {
    constant: 'MIN_SAMPLES',
    label: 'slow-rule judgment sample floor',
    pattern: /sample is under (\d+)/g,
    expected: (v) => String(v),
  },
  {
    constant: 'PROFILE_DEFAULT_WINDOW_HOURS',
    label: 'profile default window',
    pattern: /last (\d+)h/g,
    expected: (v) => String(v),
  },
];

/**
 * Markdown tables that spell out an enum, one value per row.
 *
 * Each entry names the table's file and the enum it mirrors. The check reads the first cell
 * of every row and compares that set against the manifest, both ways: a value the engine
 * dropped is still in the table, or a value it added is missing from it.
 *
 * The check points at a table rather than scanning for anything shaped like an enum value.
 * A shape-based scan cannot tell a status code from an environment variable, so it needs an
 * exception list that grows with the repo.
 */
const ENUM_TABLES = [
  {
    enumName: 'ConditionUnresolvedReason',
    file: 'skills/lexq-simulation/SKILL.md',
    heading: '#### `reasonDetail` on unevaluable conditions',
    label: 'unevaluable-condition codes',
  },
];

/** Everything this package ships as prose, plus source comments. */
const SCAN_DIRS = ['skills', 'src'];
const SCAN_FILES = ['CONTEXT.md', 'AGENTS.md', 'README.md'];
const SCAN_EXT = new Set(['.md', '.ts']);

function fail(msg, detail = []) {
  console.error(`✗ ${msg}`);
  detail.forEach((d) => console.error(`  ${d}`));
  process.exitCode = 1;
}

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, acc);
    else if (SCAN_EXT.has(path.extname(full))) acc.push(full);
  }
  return acc;
}

if (!fs.existsSync(CLI_MANIFEST)) {
  fail(`CLI manifest not found: ${path.relative(ROOT, CLI_MANIFEST)}`, [
    'It is a committed artifact. Run node scripts/gen-enums.mjs to produce it.',
  ]);
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(CLI_MANIFEST, 'utf8'));
const constants = manifest.constants;
const enums = manifest.enums;
if (!enums) {
  fail('CLI manifest has no "enums" section', [
    'Regenerate it with node scripts/gen-enums.mjs against a current engine manifest.',
  ]);
  process.exit(1);
}
if (!constants) {
  fail('CLI manifest has no "constants" section', [
    'Regenerate it with node scripts/gen-enums.mjs against a current engine manifest.',
  ]);
  process.exit(1);
}

const files = [
  ...SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d))),
  ...SCAN_FILES.map((f) => path.join(ROOT, f)).filter((f) => fs.existsSync(f)),
];

let violations = 0;
for (const mirror of PROSE_MIRRORS) {
  const value = constants[mirror.constant];
  if (value === undefined) {
    fail(`${mirror.constant} is not in the manifest`, [
      'Drop it from PROSE_MIRRORS, or add it to CONSTANTS in scripts/gen-enums.mjs.',
    ]);
    violations++;
    continue;
  }
  const want = mirror.expected(value);
  let hits = 0;
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const rx = new RegExp(mirror.pattern.source, mirror.pattern.flags);
    let m;
    while ((m = rx.exec(text))) {
      hits++;
      if (m[1] === want) continue;
      const line = text.slice(0, m.index).split('\n').length;
      fail(
        `${path.relative(ROOT, file)}:${line} states ${mirror.label} as ${m[1]}, engine says ${want}`,
        [m[0]],
      );
      violations++;
    }
  }
  if (hits === 0) {
    fail(`${mirror.label} (${mirror.constant}) matched nothing`, [
      'The wording changed and this pattern stopped looking. Fix the pattern in',
      'PROSE_MIRRORS, or drop the entry if the number is no longer stated.',
    ]);
    violations++;
  } else {
    console.log(`✓ ${mirror.label} — ${hits} mention(s), all ${want}`);
  }
}

for (const table of ENUM_TABLES) {
  const node = enums[table.enumName];
  if (!node) {
    fail(`${table.enumName} is not in the manifest`, [
      'Drop it from ENUM_TABLES, or add it to ORDER in scripts/gen-enums.mjs.',
    ]);
    violations++;
    continue;
  }

  const full = path.join(ROOT, table.file);
  if (!fs.existsSync(full)) {
    fail(`${table.label}: ${table.file} not found`, ['Fix the path in ENUM_TABLES.']);
    violations++;
    continue;
  }

  // The first table under the named heading. Anchoring on the heading matters: this file
  // holds several enum tables and an unanchored read would merge them into one set.
  const lines = fs.readFileSync(full, 'utf8').split('\n');
  const start = lines.indexOf(table.heading);
  if (start === -1) {
    fail(`${table.label}: heading not found in ${table.file}`, [
      table.heading,
      'The section was renamed. Fix `heading` in ENUM_TABLES.',
    ]);
    violations++;
    continue;
  }

  // First cell of each row, when it holds a single code-formatted SCREAMING_CASE token.
  const written = new Set();
  let seenRow = false;
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith('|')) {
      if (seenRow) break; // past the table
      continue;
    }
    seenRow = true;
    const cell = line.slice(1).split('|')[0].trim();
    const m = /^`([A-Z][A-Z0-9_]*)`$/.exec(cell);
    if (m) written.add(m[1]);
  }

  if (written.size === 0) {
    fail(`${table.label} (${table.enumName}) matched no rows`, [
      `The table in ${table.file} changed shape and this check stopped looking.`,
      'Fix the entry in ENUM_TABLES, or drop it if the table is gone.',
    ]);
    violations++;
    continue;
  }

  const declared = new Set(node.values);
  const retired = [...written].filter((v) => !declared.has(v));
  const missing = node.values.filter((v) => !written.has(v));

  if (retired.length) {
    fail(`${table.file} lists ${table.label} the engine no longer has`, [
      retired.join(', '),
    ]);
    violations += retired.length;
  }
  if (missing.length) {
    fail(`${table.file} is missing ${table.label} the engine now has`, [missing.join(', ')]);
    violations += missing.length;
  }
  if (!retired.length && !missing.length) {
    console.log(`✓ ${table.label} — ${written.size} row(s), exactly the manifest set`);
  }
}

if (violations) {
  console.error(`\n${violations} violation(s) across ${files.length} files`);
  process.exit(1);
}
console.log(
  `\n${files.length} files checked · ${PROSE_MIRRORS.length} mirrored constants · ` +
    `${ENUM_TABLES.length} mirrored table(s)`,
);
