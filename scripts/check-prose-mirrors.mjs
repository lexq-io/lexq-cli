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
 *   Enum drift      — a table or list in ENUM_TABLES holds a value the manifest dropped, or
 *                     is missing one it added. A value left out on purpose is named in
 *                     `omit` with its reason, and that name is checked too.
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
    constant: 'MAX_DATASET_SIZE',
    label: 'dataset upload size limit',
    pattern: /files can be up to (\d+) MB/g,
    expected: (v) => String(v / 1024 / 1024),
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
 * Markdown tables and lists that spell out an enum.
 *
 * Each entry names the file, the heading line the values sit under, and the enum they mirror.
 * The values are the code-formatted SCREAMING_CASE words in one of two places:
 *
 *   table (default) — the first cell of every row of a table under the heading. `table` picks
 *                     which one when the section holds more than one (0 = the first).
 *   list            — the first paragraph under the heading.
 *
 * That set is compared against the manifest both ways: a value the engine dropped is still
 * written, or a value it added is missing. `omit` names values the prose leaves out on purpose,
 * each with the reason; an omitted value the engine no longer has, or one the prose now shows,
 * is reported so the reason does not outlive the fact.
 *
 * The check points at a table rather than scanning for anything shaped like an enum value.
 * A shape-based scan cannot tell a status code from an environment variable, so it needs an
 * exception list that grows with the repo.
 */
const NOT_PRODUCED_YET =
  'the engine does not produce it yet: a version outside its effective dates leaves no trace';

const ENUM_TABLES = [
  {
    enumName: 'ApiExecutionStatus',
    file: 'skills/lexq-execution/SKILL.md',
    heading: '### Execution Statuses',
    label: 'execution statuses',
  },
  {
    enumName: 'TaskType',
    file: 'skills/lexq-execution/SKILL.md',
    heading: '## 2. Failure Logs',
    label: 'failure log task types',
  },
  {
    enumName: 'ConflictResolutionMode',
    file: 'skills/lexq-groups/SKILL.md',
    heading: '### Activation Mode (across groups in the same `activationGroup`)',
    label: 'activation modes',
  },
  {
    enumName: 'ValueType',
    file: 'skills/lexq-rules/SKILL.md',
    heading: '### Operators',
    label: 'fact types in the operator table',
  },
  {
    enumName: 'ConditionOperator',
    file: 'skills/lexq-rules/SKILL.md',
    heading: '### Operators',
    table: 1,
    label: 'condition operators',
  },
  {
    enumName: 'ValueType',
    file: 'skills/lexq-rules/SKILL.md',
    heading: '### Value Types',
    label: 'value types',
  },
  {
    enumName: 'ActionType',
    file: 'skills/lexq-rules/SKILL.md',
    heading: '## Action Types',
    label: 'action types',
  },
  {
    enumName: 'MutateOperator',
    file: 'skills/lexq-rules/SKILL.md',
    heading: '### `MUTATE_FACT` parameters',
    table: 1,
    label: 'MUTATE_FACT operators',
  },
  {
    enumName: 'ConflictResolutionMode',
    file: 'skills/lexq-rules/SKILL.md',
    heading: '## Mutex (Rule-Level Conflict Resolution)',
    label: 'mutex modes',
  },
  {
    enumName: 'DecisionStatus',
    file: 'skills/lexq-simulation/SKILL.md',
    heading: '### Reading Decision Traces',
    label: 'decision statuses',
    omit: { NOT_SELECTED: NOT_PRODUCED_YET },
  },
  {
    enumName: 'DecisionReasonCode',
    file: 'skills/lexq-simulation/SKILL.md',
    heading: '### Reading Reason Codes',
    label: 'decision reason codes',
    omit: { EFFECTIVE_DATE_INVALID: NOT_PRODUCED_YET },
  },
  {
    enumName: 'ConditionUnresolvedReason',
    file: 'skills/lexq-simulation/SKILL.md',
    heading: '#### `reasonDetail` on unevaluable conditions',
    label: 'unevaluable-condition codes',
  },
  {
    enumName: 'SimulationDatasetType',
    file: 'skills/lexq-simulation/SKILL.md',
    heading: '### Dataset Types',
    label: 'dataset types',
  },
  {
    enumName: 'SimulationStatus',
    file: 'skills/lexq-simulation/SKILL.md',
    heading: '### Check Status (Poll)',
    label: 'simulation statuses',
  },
  {
    enumName: 'PolicyGroupStatus',
    file: 'CONTEXT.md',
    heading: '### Policy Group Status',
    label: 'policy group statuses',
  },
  {
    enumName: 'PolicyVersionStatus',
    file: 'CONTEXT.md',
    heading: '### Policy Version Status',
    label: 'policy version statuses',
  },
  {
    enumName: 'ConditionOperator',
    file: 'CONTEXT.md',
    heading: '### Condition Operators',
    kind: 'list',
    label: 'condition operators',
  },
  {
    enumName: 'ValueType',
    file: 'CONTEXT.md',
    heading: '### Value Types',
    kind: 'list',
    label: 'value types',
  },
  {
    enumName: 'ActionType',
    file: 'CONTEXT.md',
    heading: '### Action Types',
    kind: 'list',
    label: 'action types',
  },
  {
    enumName: 'ConflictResolutionMode',
    file: 'CONTEXT.md',
    heading: '### Conflict Resolution Modes',
    kind: 'list',
    label: 'conflict resolution modes',
  },
  {
    enumName: 'ConflictResolutionStrategy',
    file: 'CONTEXT.md',
    heading: '### Conflict Resolution Strategies',
    kind: 'list',
    label: 'conflict resolution strategies',
  },
  {
    enumName: 'DeploymentType',
    file: 'CONTEXT.md',
    heading: '### Deployment Types',
    kind: 'list',
    label: 'deployment types',
  },
  {
    enumName: 'ApiExecutionStatus',
    file: 'CONTEXT.md',
    heading: '### Execution Statuses',
    kind: 'list',
    label: 'execution statuses',
  },
  {
    enumName: 'SimulationStatus',
    file: 'CONTEXT.md',
    heading: '### Simulation Statuses',
    kind: 'list',
    label: 'simulation statuses',
  },
  {
    enumName: 'DecisionStatus',
    file: 'CONTEXT.md',
    heading: '### Decision Statuses',
    kind: 'list',
    label: 'decision statuses',
    omit: { NOT_SELECTED: NOT_PRODUCED_YET },
  },
  {
    enumName: 'PlatformEventType',
    file: 'CONTEXT.md',
    heading: '### Platform Event Types (for webhook subscriptions)',
    kind: 'list',
    label: 'platform event types',
  },
  {
    enumName: 'WebhookPayloadFormat',
    file: 'CONTEXT.md',
    heading: '### Webhook Payload Formats',
    kind: 'list',
    label: 'webhook payload formats',
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

/** Code-formatted SCREAMING_CASE words, the way these tables and lists mark enum values. */
const enumWords = (text) => [...text.matchAll(/`([A-Z][A-Z0-9_]*)`/g)].map((m) => m[1]);

/**
 * The values an ENUM_TABLES entry writes, read from the lines after its heading: the first
 * paragraph for a list, or the first cell of every row of the chosen table.
 */
function writtenValues(lines, entry) {
  const written = new Set();
  if (entry.kind === 'list') {
    let i = 0;
    while (i < lines.length && lines[i].trim() === '') i++;
    for (; i < lines.length && lines[i].trim() !== ''; i++) {
      enumWords(lines[i]).forEach((v) => written.add(v));
    }
    return written;
  }
  const wanted = entry.table ?? 0;
  let index = -1;
  let inTable = false;
  for (const line of lines) {
    if (!line.startsWith('|')) {
      if (inTable && index === wanted) break; // past the chosen table
      inTable = false;
      continue;
    }
    if (!inTable) {
      index++;
      inTable = true;
    }
    if (index === wanted) enumWords(line.slice(1).split('|')[0]).forEach((v) => written.add(v));
  }
  return written;
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

  // Anchoring on the heading matters: these files hold several enum tables and lists, and an
  // unanchored read would merge them into one set.
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

  const written = writtenValues(lines.slice(start + 1), table);
  if (written.size === 0) {
    fail(`${table.label} (${table.enumName}) matched nothing under ${table.heading}`, [
      `The ${table.kind ?? 'table'} in ${table.file} changed shape and this check stopped looking.`,
      'Fix the entry in ENUM_TABLES, or drop it if the section is gone.',
    ]);
    violations++;
    continue;
  }

  const declared = new Set(node.values);
  const omit = table.omit ?? {};
  const retired = [...written].filter((v) => !declared.has(v));
  const missing = node.values.filter((v) => !written.has(v) && !(v in omit));
  const staleOmit = Object.keys(omit).filter((v) => !declared.has(v) || written.has(v));

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
  if (staleOmit.length) {
    fail(
      `${table.file}: omit for ${table.label} names values the engine dropped or the prose now shows`,
      [
        staleOmit.join(', '),
        'Update `omit` in ENUM_TABLES, and the sentence that explains the omission.',
      ],
    );
    violations += staleOmit.length;
  }
  if (!retired.length && !missing.length && !staleOmit.length) {
    const left = Object.keys(omit).length;
    console.log(
      `✓ ${table.label} (${table.file}) — ${written.size} value(s), the manifest set` +
        (left ? ` less ${left} left out on purpose` : ''),
    );
  }
}

if (violations) {
  console.error(`\n${violations} violation(s) across ${files.length} files`);
  process.exit(1);
}
console.log(
  `\n${files.length} files checked · ${PROSE_MIRRORS.length} mirrored constants · ` +
    `${ENUM_TABLES.length} mirrored enum table(s) and list(s)`,
);
