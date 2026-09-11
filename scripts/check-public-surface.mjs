#!/usr/bin/env node
/**
 * check-public-surface.mjs — everything here is installed and read by other people.
 *
 * The repository is readable in full, and `npm pack` ships `dist/`, `skills/`, `AGENTS.md`,
 * `CONTEXT.md`, `README.md`, `LICENSE` and `package.json` on top of that. Three things do
 * not belong in a tracked file, because none of them gives a reader anything to act on:
 *
 *   1. A cross-reference that resolves nowhere. A section sign — § — with a number after
 *      it points at a document the reader does not have. State the rule instead, or cite
 *      something that opens: a JDK API name, an error code this package returns, a value it
 *      prints.
 *
 *   2. A `lexq-` name this project does not publish. There is nothing for the reader to
 *      open, so it reads as a dead link. Say "the server", "the contract manifest".
 *
 *   3. Text outside the Latin alphabet. The text here is English, and a line in another
 *      writing system is unreadable to most of the people who receive it.
 *
 * The same three apply to commit messages. A squash merge writes the pull request body into
 * this repository's history, so a body that quotes what it removed puts it back. Pass
 * --commits <base> to scan the messages on a branch.
 *
 * A hit is fixed by rewriting the line. If the line is right as it stands, add it to ALLOW
 * below with a reason, and the reason has to be about the reader.
 *
 * Usage:  node scripts/check-public-surface.mjs [--commits <base>]
 * Exit:   0 = clean, 1 = violation. Wired into CI.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/* Not scanned. `dist/` and the full manifest are untracked build inputs/outputs; the
   lockfile is generated from the npm registry and holds no prose. */
const SKIP_EXACT = new Set(['pnpm-lock.yaml', 'LICENSE']);
const SKIP_PREFIX = ['dist/', 'node_modules/'];

/* Every `lexq-` name a reader can already open. Anything else matching `lexq-<word>` leads
   nowhere for them, and it stops the commit.

   An allow list rather than a list of names to reject, for two reasons. A reject list has
   to spell out what it rejects, in a file anyone can read. And it only catches what someone
   remembered to add, where this one catches anything new.

   Each name is here because of what it is: a repository anyone can open, a package on npm,
   a skill that ships in the tarball. Being on this list does not make a name public — check
   first, and say which of those it is. */
const PUBLIC_LEXQ_NAMES = new Set([
  'lexq-cli', // this repository
  'lexq-examples', // the other public repository
  'lexq-io', // the organization that owns both
  'lexq-mcp', // a package on npm, its repository field pointing here
  'lexq-manifest', // the contract file this repository carries
  'lexq-shared', // a skill shipped in the tarball, like the five below
  'lexq-recipes',
  'lexq-groups',
  'lexq-rules',
  'lexq-simulation',
  'lexq-execution',
]);

/* Read rather than written out, so the handle appears in one file only: the one with a
   reason to carry it. No value to compare against is a broken check, not a quiet pass. */
const OWNER = JSON.parse(fs.readFileSync(path.join(ROOT, 'glama.json'), 'utf8')).maintainers?.[0];
if (!OWNER) {
  console.error('\u2717 glama.json carries no maintainer handle to compare against');
  process.exit(1);
}

// U+00A7 is the section sign. A bare document name with no section number is not caught.
const SECTION_REFERENCE = /\u00A7\s*\d/;

/* The one writing system that has turned up here. Widen the range if another does; the
   rule is the alphabet this text is written in, not this range. */
const NON_LATIN = /[\uAC00-\uD7A3]/;

const LEXQ_NAME = /lexq-[a-z0-9]+/g;

const RULES = [
  {
    id: 'section-reference',
    what: 'internal specification reference',
    hit: (line) => SECTION_REFERENCE.test(line),
  },
  {
    id: 'private-repo',
    what: 'name of a repository or account that is not public',
    hit: (line) =>
      line.includes(OWNER) ||
      [...line.matchAll(LEXQ_NAME)].some((m) => !PUBLIC_LEXQ_NAMES.has(m[0])),
  },
  {
    id: 'non-english',
    what: 'text outside the Latin alphabet',
    hit: (line) => NON_LATIN.test(line),
  },
];

/* Deliberate exceptions. Each needs a reason, and the reason has to be about the reader. */
const ALLOW = [
  {
    file: 'glama.json',
    rule: 'private-repo',
    why: 'the MCP registry manifest requires a maintainer handle, and it names a person, not a repository',
  },
];

const allowed = (file, ruleId) => ALLOW.some((a) => a.file === file && a.rule === ruleId);

const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter((f) => !SKIP_EXACT.has(f) && !SKIP_PREFIX.some((p) => f.startsWith(p)));

const violations = [];

for (const file of tracked) {
  const full = path.join(ROOT, file);
  let text;
  try {
    text = fs.readFileSync(full, 'utf8');
  } catch {
    continue; // binary or unreadable — nothing to read as prose
  }
  if (text.includes(String.fromCharCode(0))) continue; // binary

  const lines = text.split('\n');
  for (const rule of RULES) {
    if (allowed(file, rule.id)) continue;
    lines.forEach((line, i) => {
      if (rule.hit(line)) {
        violations.push({ file, line: i + 1, what: rule.what, text: line.trim() });
      }
    });
  }
}

/* Commit messages on this branch. A squash merge turns the pull request body into a commit
   on the default branch, which is how a cleanup can re-publish the thing it cleaned. */
const commitsFlag = process.argv.indexOf('--commits');
let scannedCommits = 0;
if (commitsFlag !== -1) {
  const base = process.argv[commitsFlag + 1];
  if (!base) {
    console.error('✗ --commits needs a base revision, e.g. --commits origin/main');
    process.exit(1);
  }
  // A text sentinel, not a control byte: argv cannot carry a NUL.
  const SEP = '<<<end-of-commit>>>';
  let log = '';
  try {
    log = execFileSync('git', ['log', `${base}..HEAD`, `--format=%H %s%n%b${SEP}`], {
      cwd: ROOT,
      encoding: 'utf8',
    });
  } catch {
    console.error(`✗ cannot read commits in ${base}..HEAD`);
    process.exit(1);
  }
  const commits = log.split(SEP).filter((c) => c.trim());
  scannedCommits = commits.length;
  for (const commit of commits) {
    const sha = commit.trim().slice(0, 9);
    for (const rule of RULES) {
      for (const line of commit.split('\n')) {
        if (rule.hit(line)) {
          violations.push({
            file: `commit ${sha}`,
            line: 0,
            what: `${rule.what} in a commit message`,
            text: line.trim(),
          });
          break;
        }
      }
    }
  }
}

if (violations.length === 0) {
  const where =
    commitsFlag === -1
      ? `${tracked.length} tracked files`
      : `${tracked.length} tracked files, ${scannedCommits} commit message(s)`;
  console.log(`✓ public surface clean — ${where}`);
  process.exit(0);
}

console.error(`✗ public surface — ${violations.length} violation(s)\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  ${v.what}`);
  console.error(`      ${v.text.slice(0, 140)}`);
}
console.error(
  '\n  Generated files are not fixed by hand. src/types/enums.ts and',
  '\n  src/types/constants.ts come from scripts/gen-enums.mjs — fix the generator',
  '\n  and run `pnpm enums`.',
);
process.exit(1);
