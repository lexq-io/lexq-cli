#!/usr/bin/env node
/**
 * check-registry-manifest.mjs — keeps server.json agreeing with package.json.
 *
 * server.json is the MCP Registry listing. It restates four things package.json already
 * holds, and the registry rejects a publish where any of them disagree. That rejection
 * arrives from the release workflow, after `npm publish` has already run and cannot be
 * undone, so the disagreement has to be caught while it is still a pull request.
 *
 * The command is checked the same way. `packageArguments` reconstructs the line a client
 * runs to start the server, and the same line is printed in `lexq serve --mcp` help. If the
 * invocation changes and only one of them is updated, every install from the registry starts
 * a process that is not an MCP server, and nothing here would otherwise notice.
 *
 * Usage:  node scripts/check-registry-manifest.mjs
 * Exit:   0 = ok, 1 = mismatch. Wired into CI.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const pkg = read('package.json');
const server = read('server.json');
const npm = server.packages?.find((p) => p.registryType === 'npm');

const problems = [];
const same = (what, a, b) => {
  if (a !== b) problems.push(`${what}: server.json has ${JSON.stringify(a)}, package.json has ${JSON.stringify(b)}`);
};

same('server name vs mcpName', server.name, pkg.mcpName);
same('server version', server.version, pkg.version);
same('npm package identifier', npm?.identifier, pkg.name);
same('npm package version', npm?.version, pkg.version);

// The registry caps these; exceeding one is a publish-time rejection, not a warning.
if (server.description?.length > 100) {
  problems.push(`description is ${server.description.length} characters, over the registry's 100`);
}

/* `npx -y @lexq/cli serve --mcp`, rebuilt from the listing and matched against the help text
   that tells a user to run exactly that. */
const argv = [
  ...(npm?.runtimeArguments ?? []).map((a) => a.value ?? a.name),
  npm?.identifier,
  ...(npm?.packageArguments ?? []).map((a) => a.value ?? a.name),
];
const asHelpText = JSON.stringify(argv).replace(/,/g, ', ');
const help = fs.readFileSync(path.join(ROOT, 'src/commands/serve.ts'), 'utf8');
if (!help.includes(asHelpText)) {
  problems.push(`server.json builds ${asHelpText}, which src/commands/serve.ts does not show`);
}

if (problems.length === 0) {
  console.log(`✓ registry manifest agrees with package.json — ${server.name} ${server.version}`);
  process.exit(0);
}

console.error(`✗ registry manifest — ${problems.length} mismatch(es)\n`);
for (const p of problems) console.error(`  ${p}`);
process.exit(1);
