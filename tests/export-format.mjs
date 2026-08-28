#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// LexQ CLI — Export Format Vocabulary Test
// ═══════════════════════════════════════════════════════════════
//
// Which export formats exist is the server's decision. It ships them in the contract
// manifest, and this package derives its list from that. A hand-written list goes on
// passing every check while the server moves on without it.
//
// The copies had already drifted. The four MCP tools split two and two over which of the
// two values came first, and the `--as` help text spelled them out again in prose, once
// per export command.
//
// Like the fact-key suite, this reads the source rather than importing it, so it can assert
// there is exactly one place the vocabulary is written down.
//
// Usage:
//   node tests/export-format.mjs
//
// No build, no network, no API key.
// ═══════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

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

console.log('\n  Export format vocabulary\n');

const manifest = JSON.parse(read('contracts/lexq-manifest.cli.json'));
const formats = manifest.enums?.ExportFormat?.values ?? [];

check(
  'the manifest carries the vocabulary',
  formats.length > 0,
  'ExportFormat is missing from the manifest subset — regenerate with pnpm enums',
);

const enums = read('src/types/enums.ts');
check(
  'the generated enum matches the manifest',
  formats.every((value) => enums.includes(`'${value}'`)) &&
    /export const ExportFormat = \[/.test(enums),
  'src/types/enums.ts does not carry every manifest value',
);

// The request parameter is the lowercase form of the constant name. The server pins that
// rule; this package derives it rather than storing a second copy of the values.
const exportLib = read('src/lib/export.ts');
check(
  'the format list is derived, not written out',
  /ExportFormatName\.map\(\(name\) => name\.toLowerCase\(\)\)/.test(exportLib) &&
    /from '@\/types\/enums'/.test(exportLib),
  'src/lib/export.ts no longer derives EXPORT_FORMATS from the generated enum',
);

// Every other place must go through EXPORT_FORMATS. These are the exact shapes the source
// carried before: the union type, and two orders of the same z.enum.
const HARDCODED = [
  { label: "a 'csv' | 'json' union", re: /'csv'\s*\|\s*'json'|'json'\s*\|\s*'csv'/ },
  { label: 'a literal format enum', re: /z\.enum\(\[\s*'(?:csv|json)'/ },
];

for (const { label, re } of HARDCODED) {
  const offenders = sources('src').filter((rel) => re.test(read(rel)));
  check(
    `no source file spells out ${label}`,
    offenders.length === 0,
    offenders.map((rel) => relative('.', rel)).join(', '),
  );
}

// The `--as` help text listed the two values as prose, once per command. Prose elsewhere is
// left alone on purpose — `Upload a CSV or JSON file` is about accepted input files, and
// `Export results as CSV or JSON` is a blurb, not the list the parser enforces. Widening
// this check to all prose flags both.
const AS_OPTION = /\.option\(\s*'--as <fmt>',\s*([^,]*),/g;
const undermined = [];
let seen = 0;
for (const rel of sources('src')) {
  for (const [, description] of read(rel).matchAll(AS_OPTION)) {
    seen += 1;
    if (!description.includes('EXPORT_FORMATS')) undermined.push(`${rel}: ${description.trim()}`);
  }
}
check(
  'every --as option builds its help text from EXPORT_FORMATS',
  undermined.length === 0,
  undermined.join(' | '),
);

// Nothing found and nothing wrong read the same. If the option shape changes, the check
// above goes quiet instead of going red, so the count is asserted separately.
check('the --as check saw every export command', seen >= 4, `matched ${seen} of at least 4`);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
