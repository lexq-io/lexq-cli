#!/usr/bin/env node
/**
 * check-public-surface.mjs — this repository is public; its source is read by anyone.
 *
 * Everything here is visible on GitHub, and `npm pack` ships `dist/`, `skills/`, `AGENTS.md`,
 * `CONTEXT.md`, `README.md`, `LICENSE`, and `package.json` on top of that. A comment written
 * for the team ends up in front of every reader.
 *
 * Three things must not appear in a tracked file:
 *
 *   1. Internal specification references. A section sign followed by a number cites a
 *      document no reader here can open, so it reads as a pointer to something withheld.
 *      State the rule instead, or cite something that does open: a JDK API name, an error
 *      code this package returns, a value it prints.
 *
 *   2. Names of repositories that are not public, and the account that owns them. Say "the
 *      engine", "the server", "the contract manifest".
 *
 *   3. Korean. The working language of the team is not the language of this surface.
 *
 * The patterns below are built from escapes and fragments on purpose: this file would
 * otherwise trip its own check, and excluding it would leave the one hole that matters.
 *
 * The same three apply to commit messages. A squash merge writes the pull request body into
 * this repository's history, so a body that quotes what it removed puts it back. Pass
 * --commits <base> to scan the messages on a branch.
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

/* Repository names that are not public. `lexq-shared` and `lexq-mcp` are deliberately absent:
   both name directories inside this repository (skills/lexq-shared, lexq-mcp/), so forbidding
   the string would flag paths that are already public and correct. */
const PRIVATE_REPOS = [
  'engine',
  'console',
  'docs',
  'web',
  'admin',
  'constitution',
  'compliance',
  'verify',
].map((name) => `lexq-${name}`);

const OWNER = ['sanghyunp', 'dev'].join('-');

const RULES = [
  {
    id: 'section-reference',
    what: 'internal specification reference',
    // U+00A7 is the section sign. The word form is split so this file does not match itself.
    re: new RegExp(`\\u00A7\\s*\\d|${['CONVEN', 'TIONS'].join('')}`),
  },
  {
    id: 'private-repo',
    what: 'name of a repository that is not public',
    re: new RegExp([...PRIVATE_REPOS, OWNER].join('|')),
  },
  {
    id: 'korean',
    what: 'Korean text',
    // Hangul syllables, as escapes so this file does not match itself.
    re: /[\uAC00-\uD7A3]/,
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

const allowed = (file, ruleId) =>
  ALLOW.some((a) => a.file === file && a.rule === ruleId);

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
      if (rule.re.test(line)) {
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
        if (rule.re.test(line)) {
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
  '\n  and run `pnpm enums`.'
);
process.exit(1);
