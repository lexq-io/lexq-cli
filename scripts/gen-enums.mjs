#!/usr/bin/env node
/**
 * gen-enums.mjs — generates src/types/enums.ts and src/types/constants.ts from the
 * engine contract manifest.
 *
 * Why:
 *   These enums used to be hand-copied from the server. Copies drift. At conversion
 *   time ActionType had a different member order and ProfilePhase was missing TOTAL.
 *
 * Split of responsibility:
 *   Which enums to expose  -> ORDER in this file. That is the CLI's call.
 *   What values they hold  -> the manifest. That is the engine's fact.
 *   How it is formatted    -> .prettierrc. Not restated here.
 *   A name in ORDER that the manifest does not have is a hard failure: the CLI would
 *   be shipping an enum the server no longer serves.
 *
 * Two manifests, on purpose:
 *   contracts/lexq-manifest.json      full, engine-delivered, NOT COMMITTED (.gitignore).
 *                                     It is wider than what this repo exposes.
 *   contracts/lexq-manifest.cli.json  the ORDER subset, committed. Identical in exposure
 *                                     to enums.ts itself, so it adds no public surface,
 *                                     and it lets CI verify without the full manifest.
 *
 * Usage:  node scripts/gen-enums.mjs [--check]
 *           (no flag) regenerate  — needs the full manifest
 *           --check              verify  — reads the committed subset only
 * Exit:   0 = ok, 1 = violation. Wired into CI.
 *
 * Formatting is delegated to prettier so that .prettierrc stays the single source of
 * truth. Restating printWidth here would be another hand-kept copy, which is the thing
 * this generator exists to remove.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FULL_MANIFEST = path.join(ROOT, 'contracts/lexq-manifest.json');
const CLI_MANIFEST = path.join(ROOT, 'contracts/lexq-manifest.cli.json');
const TARGET = path.join(ROOT, 'src/types/enums.ts');
const CONST_TARGET = path.join(ROOT, 'src/types/constants.ts');
const CHECK = process.argv.includes('--check');

/**
 * Numeric engine constants this CLI mirrors. Same split as ORDER: the list is the CLI's
 * call, the values are the engine's fact.
 *
 * Every one of these already appears in what this package ships — option help, MCP tool
 * descriptions, skill docs. Carrying them in the subset adds no public surface; it only
 * gives us something to compare against. Before this list the numbers were hand-typed in
 * 12 places with nothing to catch a drift.
 *
 * Keys are the engine's `DeclaringClass.FIELD`. Only the field name is emitted, the same
 * way nested enum names are flattened — an engine class name is not something this public
 * repo needs to carry.
 */
const CONSTANTS = [
  'PolicyConstants.MAX_ROUNDING_SCALE',
  'PolicyGroup.MIN_TRAFFIC_RATE',
  'PolicyGroup.MAX_TRAFFIC_RATE',
  'ReplayJobService.REPLAY_WINDOW_MAX_RECORDS',
  'DeterministicSampler.PROFILE_SAMPLE_PERMILLE',
  'LatencyWindowFlusher.LATENCY_WINDOW_MILLIS',
  'QuantileDisplayGate.TAIL_MIN_OBS',
  'SlowRuleJudge.SLOW_MULTIPLIER',
  'SlowRuleJudge.MIN_SAMPLES',
  'SlowRuleJudge.MIN_COHORT_SIZE',
  'PolicyProfileService.PROFILE_DEFAULT_WINDOW_HOURS',
];

/** Enums this CLI exposes, in output order. The manifest is wider; anything not listed stays out. */
const ORDER = [
  'PolicyGroupStatus',
  'PolicyVersionStatus',
  'ConditionOperator',
  'LogicalOperator',
  'ActionType',
  'ValueType',
  'ConflictResolutionMode',
  'ConflictResolutionStrategy',
  'DeploymentType',
  'ApiExecutionStatus',
  'ApiExecutionType',
  'ProfileCacheState',
  'ProfilePhase',
  'BaselineStatus',
  'DecisionStatus',
  'DecisionReasonCode',
  'SimulationStatus',
  'SimulationDatasetType',
  'SimulationDatasetSource',
  'SimulationMetricType',
  'ExportFormat',
  'Role',
  'FailureStatus',
  'FailureAction',
  'TaskType',
  'PlatformEventType',
  'WebhookPayloadFormat',
  'Confidence',
  'SourceKind',
  'SkipReason',
  'DeploymentScheduleStatus',
  'ScheduleCancelReason',
  'ScheduleFailureReason',
];

/**
 * Comments placed above a declaration. Carried over from the hand-written file.
 * The HAS_* note used to sit between array members; it moved above the declaration.
 */
const NOTES = {
  PolicyGroupStatus: ['── Policy Engine ──'],
  ConditionOperator: [
    '── Condition & Action ──',
    'HAS_ANY/HAS_ALL/HAS_NONE are LIST-typed facts only. Mirror of IN/NOT_IN:',
    'IN takes a scalar fact and a list value; HAS_* takes a list on both sides.',
  ],
  ConflictResolutionMode: ['── Conflict Resolution ──'],
  DeploymentType: [
    '── Deployment ──',
    'PUBLISH removed — publishing is a qualification event, not a deployment (server enum dropped it).',
  ],
  ApiExecutionStatus: ['── Execution ──'],
  ProfileCacheState: ['── Latency Profile ──'],
  DecisionStatus: ['── Decision ──'],
  SimulationStatus: ['── Simulation ──'],
  Role: ['── Auth ──'],
  FailureStatus: ['── Failure Log ──'],
  PlatformEventType: ['── Platform Event ──'],
  DeploymentScheduleStatus: ['── Scheduled Deployment ──'],
};

const HEADER = `// Generated file. Do not edit by hand.
//
//   regenerate  node scripts/gen-enums.mjs      (needs the engine-delivered manifest)
//   verify      node scripts/gen-enums.mjs --check
//   source      the engine contract manifest, via contracts/lexq-manifest.cli.json
//
// To change a value, change the enum in the engine. To change which enums are
// exposed here, edit ORDER in scripts/gen-enums.mjs.
`;

function fail(msg, detail = []) {
  console.error(`✗ ${msg}`);
  detail.forEach((d) => console.error(`  ${d}`));
  process.exit(1);
}

async function loadPrettier() {
  try {
    return await import('prettier');
  } catch {
    fail('prettier not found', ['It is a devDependency of this repo. Run pnpm install first.']);
  }
}

function readManifest(file, label) {
  if (!fs.existsSync(file)) return null;
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!raw.enums || typeof raw.enums !== 'object') {
    fail(`${label} has no "enums" object: ${path.relative(ROOT, file)}`);
  }
  const byName = new Map();
  for (const [key, def] of Object.entries(raw.enums)) {
    // Nested engine enums arrive as Outer$Inner; the CLI uses the inner name.
    const simple = key.includes('$') ? key.split('$').pop() : key;
    if (byName.has(simple)) {
      fail(`${label} name collision: ${simple}`, [
        'Two nested enums share a simple name. ORDER cannot tell them apart.',
      ]);
    }
    byName.set(simple, def);
  }

  // The full manifest keys constants as DeclaringClass.FIELD; the committed subset keys
  // them by field name only. Accept both so one loader serves both files.
  const constants = new Map();
  for (const [key, def] of Object.entries(raw.constants ?? {})) {
    const field = key.includes('.') ? key.split('.').pop() : key;
    if (constants.has(field)) {
      fail(`${label} constant name collision: ${field}`, [
        'Two engine constants share a field name. CONSTANTS cannot tell them apart.',
      ]);
    }
    constants.set(field, typeof def === 'object' ? def.value : def);
  }
  return { enums: byName, constants };
}

/** Emits the declarations unformatted. Line breaks and semicolons are prettier's call. */
function renderSource(enums) {
  const missing = ORDER.filter((n) => !enums.has(n));
  if (missing.length) {
    fail(`${missing.length} enum(s) not in the manifest`, [
      ...missing.map((n) => `${n} — gone from the engine, or graded INTERNAL`),
      '',
      'If the CLI no longer needs it, drop it from ORDER.',
      'If it should be there, check the engine @Contract grade.',
    ]);
  }
  const dup = ORDER.filter((n, i) => ORDER.indexOf(n) !== i);
  if (dup.length) fail(`duplicate entries in ORDER: ${[...new Set(dup)].join(', ')}`);

  const chunks = [HEADER];
  for (const name of ORDER) {
    const lines = [];
    (NOTES[name] ?? []).forEach((c) => lines.push(`// ${c}`));
    const values = enums
      .get(name)
      .values.map((v) => `'${v}'`)
      .join(', ');
    lines.push(`export const ${name} = [${values}] as const`);
    lines.push(`export type ${name} = (typeof ${name})[number]`);
    chunks.push(lines.join('\n') + '\n');
  }
  return chunks.join('\n');
}

const CONST_HEADER = `// Generated file. Do not edit by hand.
//
//   regenerate  node scripts/gen-enums.mjs      (needs the engine-delivered manifest)
//   verify      node scripts/gen-enums.mjs --check
//   source      the engine contract manifest, via contracts/lexq-manifest.cli.json
//
// To change a value, change the constant in the engine. To change which constants are
// exposed here, edit CONSTANTS in scripts/gen-enums.mjs.
`;

function fieldOf(key) {
  return key.includes('.') ? key.split('.').pop() : key;
}

/** Emits the constant declarations unformatted. */
function renderConstants(constants) {
  const missing = CONSTANTS.filter((k) => !constants.has(fieldOf(k)));
  if (missing.length) {
    fail(`${missing.length} constant(s) not in the manifest`, [
      ...missing.map((k) => `${k} — gone from the engine, or graded INTERNAL`),
      '',
      'If the CLI no longer needs it, drop it from CONSTANTS.',
      'If it should be there, check the engine @Contract grade.',
    ]);
  }
  const chunks = [CONST_HEADER];
  for (const key of CONSTANTS) {
    const field = fieldOf(key);
    chunks.push(`export const ${field} = ${constants.get(field)}\n`);
  }
  return chunks.join('\n');
}

/** The committed subset. Same exposure as enums.ts, so CI can verify without the full manifest. */
function renderSubset({ enums, constants }) {
  const out = {
    schemaVersion: 2,
    note: 'Subset of the engine contract manifest limited to ORDER and CONSTANTS in scripts/gen-enums.mjs. Generated; do not edit.',
    enums: {},
    constants: {},
  };
  // Values only. The engine's contract grade is an internal classification the CLI
  // does not consume, and this file is committed to a public repo.
  for (const name of ORDER) {
    out.enums[name] = { values: enums.get(name).values };
  }
  for (const key of CONSTANTS) {
    const field = fieldOf(key);
    out.constants[field] = constants.get(field);
  }
  return JSON.stringify(out, null, 2);
}

const prettier = await loadPrettier();

/** .prettierrc is the single source of truth for formatting. */
async function formatWith(source, filepath, parser) {
  const options = await prettier.resolveConfig(filepath);
  return prettier.format(source, { ...options, parser });
}

if (!CHECK) {
  const full = readManifest(FULL_MANIFEST, 'manifest');
  if (full === null) {
    fail(`full manifest not found: ${path.relative(ROOT, FULL_MANIFEST)}`, [
      'It is gitignored: this repo is public and the full manifest is wider than what',
      'this package exposes. Regeneration needs a copy of it placed at that path.',
      '',
      'You do not need it to verify. --check reads the committed subset and is what CI',
      'runs; the subset itself is verified upstream against the engine.',
    ]);
  }
  fs.mkdirSync(path.dirname(CLI_MANIFEST), { recursive: true });
  fs.writeFileSync(
    TARGET,
    await formatWith(renderSource(full.enums), TARGET, 'typescript'),
    'utf8',
  );
  fs.writeFileSync(
    CONST_TARGET,
    await formatWith(renderConstants(full.constants), CONST_TARGET, 'typescript'),
    'utf8',
  );
  fs.writeFileSync(
    CLI_MANIFEST,
    await formatWith(renderSubset(full), CLI_MANIFEST, 'json'),
    'utf8',
  );
  const skipped = [...full.enums.keys()].filter((n) => !ORDER.includes(n));
  console.log(
    `✓ generated enums.ts, constants.ts and the CLI manifest subset — ${ORDER.length} enums, ${CONSTANTS.length} constants`,
  );
  if (skipped.length) {
    console.log(
      `  in the manifest but not exposed here (${skipped.length}): ${skipped.join(', ')}`,
    );
  }
  process.exit(0);
}

const subset = readManifest(CLI_MANIFEST, 'CLI manifest');
if (subset === null) {
  fail(`CLI manifest not found: ${path.relative(ROOT, CLI_MANIFEST)}`, [
    'It is a committed artifact. Run node scripts/gen-enums.mjs to produce it.',
  ]);
}
if (!fs.existsSync(TARGET)) fail(`target missing: ${path.relative(ROOT, TARGET)}`);
if (!fs.existsSync(CONST_TARGET)) fail(`target missing: ${path.relative(ROOT, CONST_TARGET)}`);

const generatedConstants = await formatWith(
  renderConstants(subset.constants),
  CONST_TARGET,
  'typescript',
);
if (fs.readFileSync(CONST_TARGET, 'utf8') !== generatedConstants) {
  fail('constants.ts does not match the manifest', [
    ...CONSTANTS.map((k) => `${fieldOf(k)} = ${subset.constants.get(fieldOf(k))}`),
    '',
    'Run node scripts/gen-enums.mjs to regenerate.',
  ]);
}

const generated = await formatWith(renderSource(subset.enums), TARGET, 'typescript');
const current = fs.readFileSync(TARGET, 'utf8');
if (current === generated) {
  console.log(
    `✓ enums.ts and constants.ts match the manifest — ${ORDER.length} enums, ${CONSTANTS.length} constants`,
  );
  process.exit(0);
}

const a = current.split('\n');
const b = generated.split('\n');
const diff = [];
for (let i = 0; i < Math.max(a.length, b.length) && diff.length < 20; i++) {
  if (a[i] !== b[i]) {
    diff.push(
      `line ${i + 1}\n    current:   ${a[i] ?? '(none)'}\n    generated: ${b[i] ?? '(none)'}`,
    );
  }
}
fail('enums.ts does not match the manifest', [...diff, '', 'Run node scripts/gen-enums.mjs.']);
