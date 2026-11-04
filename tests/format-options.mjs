#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// LexQ CLI — Output Format and File Format Test
// ═══════════════════════════════════════════════════════════════
//
// Two options name a format, and they mean different things.
//
// - The root `--format` sets how a command prints its result: json or table. Any other value
//   is rejected with a pointer to `--as`. Commands check only for `table`, so before this
//   `--format csv` and `--format tabel` printed JSON without a word.
// - `--as` sets the format of the file that an export or a dataset template writes: csv or
//   json. These commands do not read `--format`. When the call suggests another format, they
//   say on stderr which format the file has: when the `--output` name ends in the other
//   extension, or, when the name says nothing, when `--format` was given and `--as` was not.
//
// Requests are read from `--dry-run`, which stops before anything is written, so `--output`
// names no real file. The dataset template does not honor `--dry-run`, so its request goes to
// a local server.
//
// Usage:
//   pnpm build && node tests/format-options.mjs
// ═══════════════════════════════════════════════════════════════

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
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

/**
 * Runs the CLI and resolves with its exit code and output. Asynchronous, so the local server
 * below can answer while the CLI waits.
 */
function run(args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [CLI, ...args], { encoding: 'utf8' }, (error, stdout, stderr) => {
      resolve({ code: error ? (error.code ?? 1) : 0, stdout, stderr });
    });
  });
}

const DRY = ['--dry-run', '--api-key', 'test'];
const UUID = '11111111-1111-4111-8111-111111111111';
const FORMAT_NOTE = 'Note: --format sets how results are printed, not the file.';

/** The request line `--dry-run` printed, or '' when there was none. */
const requestLine = (stdout) => stdout.split('\n').find((line) => line.startsWith('GET ')) ?? '';

console.log(`\n${DIM}  Output format and file format${NC}\n`);

// ── The root --format ──────────────────────────────────────────
for (const value of ['csv', 'tabel']) {
  const r = await run([...DRY, '--format', value, 'facts', 'list']);
  check(
    `--format ${value} fails and points to --as`,
    r.code !== 0 && r.stderr.includes(`argument '${value}' is invalid`) && r.stderr.includes('--as'),
    `exit ${r.code}: ${r.stderr.trim()}`,
  );
}

for (const value of ['json', 'table']) {
  const r = await run([...DRY, '--format', value, 'facts', 'list']);
  check(
    `--format ${value} is accepted`,
    r.code === 0 && requestLine(r.stdout).includes('/schema/facts'),
    `exit ${r.code}: ${r.stderr.trim()}`,
  );
}

const badSim = await run([...DRY, 'analytics', 'simulation', 'export', '--id', UUID, '--format', 'csv']);
check(
  '--format csv on simulation export fails before any request',
  badSim.code !== 0 && requestLine(badSim.stdout) === '',
  `exit ${badSim.code}: ${badSim.stdout.trim()} ${badSim.stderr.trim()}`,
);

// ── Commands that write a file ─────────────────────────────────
// `note` is text the note must contain, or null when no note may print.
const cases = [
  { name: 'facts export', args: ['facts', 'export'], file: 'csv', note: null },
  {
    name: '--format json on facts export, without --as',
    args: ['--format', 'json', 'facts', 'export'],
    file: 'csv',
    note: `${FORMAT_NOTE} This file is csv`,
  },
  {
    name: '--format json and --as json on facts export',
    args: ['--format', 'json', 'facts', 'export', '--as', 'json'],
    file: 'json',
    note: null,
  },
  {
    name: '--format table after the command, with --as csv',
    args: ['facts', 'export', '--format', 'table', '--as', 'csv'],
    file: 'csv',
    note: null,
  },
  {
    name: '--format table on simulation export, without --as',
    args: ['analytics', 'simulation', 'export', '--id', UUID, '--format', 'table'],
    file: 'json',
    note: `${FORMAT_NOTE} This file is json`,
  },
  {
    name: '--format json on replay export, without --as',
    args: ['replay', 'export', '--id', UUID, '--format', 'json'],
    file: 'json',
    note: `${FORMAT_NOTE} This file is json`,
  },
  {
    name: 'facts export to facts.json, without --as',
    args: ['facts', 'export', '--output', 'facts.json'],
    file: 'csv',
    note: 'Note: facts.json will hold csv. Pass --as json to write json.',
  },
  {
    name: '--as csv with --output facts.json',
    args: ['facts', 'export', '--as', 'csv', '--output', 'facts.json'],
    file: 'csv',
    note: 'Note: facts.json will hold csv.',
  },
  {
    name: '--as json with --output facts.json',
    args: ['facts', 'export', '--as', 'json', '--output', 'facts.json'],
    file: 'json',
    note: null,
  },
  {
    name: '--format json on facts export to facts.csv, without --as',
    args: ['--format', 'json', 'facts', 'export', '--output', 'facts.csv'],
    file: 'csv',
    note: null,
  },
  {
    name: 'replay export to blast-radius.CSV, without --as',
    args: ['replay', 'export', '--id', UUID, '--output', 'blast-radius.CSV'],
    file: 'json',
    note: 'Note: blast-radius.CSV will hold json. Pass --as csv to write csv.',
  },
];

for (const c of cases) {
  const r = await run([...DRY, ...c.args]);
  const line = requestLine(r.stdout);
  const noteRight = c.note === null ? !r.stderr.includes('Note:') : r.stderr.includes(c.note);
  check(
    `${c.name}: asks for ${c.file}, ${c.note === null ? 'without a note' : 'with the note'}`,
    r.code === 0 && line.includes(`format=${c.file}`) && noteRight,
    `exit ${r.code}: ${line} | ${r.stderr.trim()}`,
  );
}

// The dataset template sends its request even with --dry-run, so a local server takes it.
const seen = [];
const server = createServer((req, res) => {
  seen.push(req.url);
  res.writeHead(200, { 'content-type': 'text/csv' });
  res.end('amount\n');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/api/v1/partners`;
const template = await run([
  '--api-key',
  'test',
  '--base-url',
  base,
  '--format',
  'json',
  'analytics',
  'dataset',
  'template',
  '--group-id',
  UUID,
  '--version-id',
  UUID,
]);
server.close();
check(
  '--format json on dataset template, without --as: asks for csv, with the note',
  template.code === 0 &&
    seen.length === 1 &&
    seen[0].includes('format=csv') &&
    template.stderr.includes(`${FORMAT_NOTE} This file is csv`),
  `exit ${template.code}: ${seen.join(' ')} | ${template.stderr.trim()}`,
);

// ── --as keeps its own check ───────────────────────────────────
const asTable = await run([...DRY, 'facts', 'export', '--as', 'table']);
check(
  '--as table is rejected',
  asTable.code !== 0 &&
    `${asTable.stdout}${asTable.stderr}`.includes('Unsupported export format: table'),
  `exit ${asTable.code}: ${asTable.stdout.trim()} ${asTable.stderr.trim()}`,
);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
