#!/usr/bin/env node
/**
 * check-tool-schemas.mjs — the tool schemas this package publishes are a contract.
 *
 * `tools/list` is what an agent reads before it decides which tool to call and how to fill
 * its arguments. That response is assembled from the Zod schemas in src/mcp/tools by the
 * SDK, so a change in either one rewrites what every agent sees. Bumping a dependency is
 * enough. Nothing else in this repository would notice: the build succeeds, the type check
 * passes, the lint passes, and the package ships with a different contract than the one
 * reviewed.
 *
 * This script closes that gap. It boots a real server, registers every tool, connects a real
 * client over an in-memory transport, and records the `tools/list` response. Reading the
 * registry object directly would be cheaper and wrong — the contract is the wire response,
 * and the SDK is what turns schemas into it.
 *
 * The snapshot is canonical, not raw: object keys are sorted recursively before it is
 * written. Key order carries no meaning in JSON Schema, so a reordering is not a contract
 * change and should not fail a build. A raw digest is printed on every run anyway, so a
 * reordering is still visible to anyone comparing two runs by eye.
 *
 * Usage:  node scripts/check-tool-schemas.mjs [--update]
 * Exit:   0 = snapshot matches, 1 = it does not, 2 = the check could not run.
 *
 * Exit 2 is separate on purpose. Without it "there was nothing to check" and "the check
 * passed" produce the same code, and a missing build would read as a clean run.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT = path.join(ROOT, 'contracts', 'tool-schemas.json');
const BUILT_ENTRY = path.join(ROOT, 'dist', 'mcp', 'register.js');

const update = process.argv.includes('--update');

function bail(message, hint) {
  console.error(`✗ ${message}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(2);
}

if (!fs.existsSync(BUILT_ENTRY)) {
  bail(
    'dist/mcp/register.js is missing',
    'Run `pnpm build` first. This script reads the build output, not the source.',
  );
}

/**
 * Recursively sorts object keys. Arrays keep their order; array order is meaningful in
 * JSON Schema.
 */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

let McpServer, Client, InMemoryTransport, registerAllTools;
try {
  ({ McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js'));
  ({ Client } = await import('@modelcontextprotocol/sdk/client/index.js'));
  ({ InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js'));
  ({ registerAllTools } = await import(BUILT_ENTRY));
} catch (error) {
  bail(`could not load the server or the built tools: ${error.message}`);
}

const server = new McpServer({ name: 'tool-schema-snapshot', version: '0.0.0' });

/* Never invoked. `tools/list` does not run a tool, and a handler that throws makes that
   assumption visible instead of quietly returning something plausible. */
const callApi = async () => {
  throw new Error('callApi must not be reached while listing tools');
};

registerAllTools(server, callApi);

const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: 'tool-schema-snapshot', version: '0.0.0' });
await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

/* Paginated in the protocol. Follow the cursor instead of assuming one page holds every tool. */
const tools = [];
let cursor;
do {
  const page = await client.listTools(cursor ? { cursor } : {});
  tools.push(...page.tools);
  cursor = page.nextCursor;
} while (cursor);

await client.close();
await server.close();

if (tools.length === 0) {
  bail('the server listed no tools', 'A snapshot of nothing would pass every future check.');
}

const names = tools.map((tool) => tool.name);
const duplicates = names.filter((name, i) => names.indexOf(name) !== i);
if (duplicates.length > 0) {
  bail(`duplicate tool names: ${[...new Set(duplicates)].join(', ')}`);
}

tools.sort((a, b) => a.name.localeCompare(b.name, 'en'));

const rawDigest = createHash('sha256').update(JSON.stringify(tools)).digest('hex').slice(0, 16);
const snapshot = `${JSON.stringify(canonical({ toolCount: tools.length, tools }), null, 2)}\n`;

console.log(`  tools: ${tools.length} · raw digest: ${rawDigest}`);

if (update) {
  fs.mkdirSync(path.dirname(SNAPSHOT), { recursive: true });
  fs.writeFileSync(SNAPSHOT, snapshot);
  console.log(`✓ wrote ${path.relative(ROOT, SNAPSHOT)}`);
  process.exit(0);
}

if (!fs.existsSync(SNAPSHOT)) {
  bail(
    `${path.relative(ROOT, SNAPSHOT)} is missing`,
    'Run `pnpm schemas:update` once to record the current contract, and review what it writes.',
  );
}

const committed = fs.readFileSync(SNAPSHOT, 'utf8');
if (committed === snapshot) {
  console.log('✓ tool schemas match the recorded contract');
  process.exit(0);
}

console.error('✗ tool schemas differ from the recorded contract');
console.error('');

const a = committed.split('\n');
const b = snapshot.split('\n');
let shown = 0;
for (let i = 0; i < Math.max(a.length, b.length) && shown < 40; i++) {
  if (a[i] === b[i]) continue;
  if (a[i] !== undefined) console.error(`  -${a[i]}`);
  if (b[i] !== undefined) console.error(`  +${b[i]}`);
  shown++;
}
if (shown >= 40) console.error('  ... more differences not shown');

console.error('');
console.error('  This is what every agent reads before calling a tool. If the change is');
console.error('  intended, run `pnpm schemas:update` and review the diff in the same commit.');
process.exit(1);
