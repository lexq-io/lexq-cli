#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// LexQ CLI — Command Options Test
// ═══════════════════════════════════════════════════════════════
//
// Options on the root program are global. Commander reads them before and after a
// subcommand, so a subcommand option with the same flag never reaches the subcommand.
// `lexq profile <groupId> --version <versionId>` printed the CLI version and exited 0,
// because the root program owns `-V, --version`.
//
// A command that reads its request body from --file must not also require --json.
// Commander rejects the call before the action runs, so the file is never read.
// `lexq analytics simulation start --file request.json` failed with
// "required option '--json <body>' not specified".
//
// This reads the source rather than importing it: it collects the root flags from
// src/cli.ts and checks every command declared under src/commands.
//
// Usage:
//   node tests/command-options.mjs
//
// No build, no network, no API key.
// ═══════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf-8');

function sources(dir, out = []) {
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, entry);
    if (statSync(join(ROOT, rel)).isDirectory()) sources(rel, out);
    else if (rel.endsWith('.ts')) out.push(rel);
  }
  return out;
}

/** `'-V, --version'` or `'--version-id <versionId>'` → the flags alone. */
const flagsOf = (spec) => spec.split(/[\s,|]+/).filter((token) => token.startsWith('-'));

console.log('\n  Command options\n');

// Root flags: the `.version(...)` flags and every `.option(...)` declared in src/cli.ts.
const cli = read('src/cli.ts');
const rootFlags = new Set();
for (const [, spec] of cli.matchAll(/\.version\([^,]+,\s*'([^']+)'\)/g)) {
  flagsOf(spec).forEach((flag) => rootFlags.add(flag));
}
for (const [, spec] of cli.matchAll(/\.option\(\s*'([^']+)'/g)) {
  flagsOf(spec).forEach((flag) => rootFlags.add(flag));
}

check(
  'the root program declares its flags in src/cli.ts',
  rootFlags.has('--version') && rootFlags.has('--format'),
  `found ${[...rootFlags].join(' ') || 'none'}`,
);

// The whole file, not line by line: a declaration often puts the flags on the next line
// (`.option(\n  '--rule <ruleId>',`), and `\s*` crosses that newline.
const OPTION = /\.(?:option|requiredOption)\(\s*'([^']+)'|new Option\(\s*'([^']+)'/g;
const collisions = [];
let seen = 0;
for (const rel of sources('src/commands')) {
  const text = read(rel);
  for (const match of text.matchAll(OPTION)) {
    seen += 1;
    const line = text.slice(0, match.index).split('\n').length;
    for (const flag of flagsOf(match[1] ?? match[2])) {
      if (rootFlags.has(flag)) collisions.push(`${rel}:${line} ${flag}`);
    }
  }
}

check(
  'no command declares a flag the root program already owns',
  collisions.length === 0,
  collisions.join(' | '),
);

// Nothing found and nothing wrong read the same. If the option shape changes, the check
// above goes quiet instead of going red, so the count is asserted separately.
check(`the scan saw ${seen} command options (at least 200)`, seen >= 200);

// A command's options follow its `.command('...')` in the chain, so the text up to the
// next `.command(` is that command's declaration.
const COMMAND = /\.command\(\s*'([^']+)'/g;
const REQUIRED_JSON = /\.requiredOption\(\s*'--json\b/;
const FILE_OPTION = /\.option\(\s*'--file\b/;
const fileButJsonRequired = [];
let commands = 0;
for (const rel of sources('src/commands')) {
  const text = read(rel);
  const starts = [...text.matchAll(COMMAND)];
  starts.forEach((match, i) => {
    commands += 1;
    const block = text.slice(match.index, starts[i + 1]?.index ?? text.length);
    if (FILE_OPTION.test(block) && REQUIRED_JSON.test(block)) {
      const line = text.slice(0, match.index).split('\n').length;
      fileButJsonRequired.push(`${rel}:${line} ${match[1]}`);
    }
  });
}

check(
  'no command that accepts --file also requires --json',
  fileButJsonRequired.length === 0,
  fileButJsonRequired.join(' | '),
);
check(`the scan saw ${commands} commands (at least 90)`, commands >= 90);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
