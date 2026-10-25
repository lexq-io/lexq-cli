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
 * The local server (`lexq serve --mcp`) serves those tools plus a few that read the machine
 * it runs on. No library entry exports those, which is what keeps them off the hosted
 * server, so they are listed from the built binary over stdio and recorded in a second
 * snapshot. The same run checks that the local server serves every shared tool unchanged.
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
const LOCAL_SNAPSHOT = path.join(ROOT, 'contracts', 'tool-schemas.local.json');
const BUILT_ENTRY = path.join(ROOT, 'dist', 'mcp', 'register.js');
const BUILT_CLI = path.join(ROOT, 'dist', 'index.js');

const update = process.argv.includes('--update');

function bail(message, hint) {
  console.error(`✗ ${message}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(2);
}

for (const built of [BUILT_ENTRY, BUILT_CLI]) {
  if (!fs.existsSync(built)) {
    bail(
      `${path.relative(ROOT, built)} is missing`,
      'Run `pnpm build` first. This script reads the build output, not the source.',
    );
  }
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

let McpServer, Client, InMemoryTransport, StdioClientTransport, registerAllTools;
try {
  ({ McpServer } = await import('@modelcontextprotocol/server'));
  ({ Client } = await import('@modelcontextprotocol/client'));
  ({ StdioClientTransport } = await import('@modelcontextprotocol/client/stdio'));
  ({ InMemoryTransport } = await import('@modelcontextprotocol/server'));
  ({ registerAllTools } = await import(BUILT_ENTRY));
} catch (error) {
  bail(`could not load the server or the built tools: ${error.message}`);
}

/* Paginated in the protocol. Follow the cursor instead of assuming one page holds every tool. */
async function listAll(client) {
  const listed = [];
  let cursor;
  do {
    const page = await client.listTools(cursor ? { cursor } : {});
    listed.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);
  return listed;
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

const tools = await listAll(client);

await client.close();
await server.close();

if (tools.length === 0) {
  bail('the server listed no tools', 'A snapshot of nothing would pass every future check.');
}

/* The binary a client runs, reached the way a client reaches it. Listing does not call the
   API, so no key or config is needed. */
const localClient = new Client({ name: 'tool-schema-snapshot', version: '0.0.0' });
let served;
try {
  await localClient.connect(
    new StdioClientTransport({ command: process.execPath, args: [BUILT_CLI, 'serve', '--mcp'] }),
  );
  served = await listAll(localClient);
} catch (error) {
  bail(`could not list the tools of \`lexq serve --mcp\`: ${error.message}`);
} finally {
  await localClient.close();
}

for (const [label, listed] of [
  ['registerAllTools', tools],
  ['lexq serve --mcp', served],
]) {
  const names = listed.map((tool) => tool.name);
  const duplicates = names.filter((name, i) => names.indexOf(name) !== i);
  if (duplicates.length > 0) {
    bail(`duplicate tool names in ${label}: ${[...new Set(duplicates)].join(', ')}`);
  }
}

const shared = new Map(tools.map((tool) => [tool.name, JSON.stringify(canonical(tool))]));
const servedNames = new Set(served.map((tool) => tool.name));
const drifted = [
  ...tools.filter((tool) => !servedNames.has(tool.name)).map((tool) => `${tool.name} (missing)`),
  ...served
    .filter(
      (tool) => shared.has(tool.name) && shared.get(tool.name) !== JSON.stringify(canonical(tool)),
    )
    .map((tool) => `${tool.name} (different)`),
];
if (drifted.length > 0) {
  console.error('✗ `lexq serve --mcp` does not serve every shared tool as registerAllTools does\n');
  for (const name of drifted) console.error(`  ${name}`);
  process.exit(1);
}
const localTools = served.filter((tool) => !shared.has(tool.name));

/* Every tool has to say who it is and what it does to the caller's data. The Claude
   Connectors Directory refuses a submission that is missing either, and the reason it
   asks is the reason it matters here too: a client decides whether to confirm a call
   from these, and `destructiveHint` defaults to true only when `readOnlyHint` is false,
   so a write that adds nothing but is left unannotated reads as one that might delete.

   Checked at the wire rather than in the source: the annotation has to survive
   registration to mean anything, and a tool added to a new file would slip past a grep. */
const unannotated = [...tools, ...localTools].filter(
  (tool) =>
    !tool.title ||
    !tool.annotations ||
    (tool.annotations.readOnlyHint !== true &&
      typeof tool.annotations.destructiveHint !== 'boolean'),
);
if (unannotated.length > 0) {
  console.error(
    `✗ ${unannotated.length} tool(s) missing a title or a read-only/destructive hint\n`,
  );
  for (const tool of unannotated) {
    console.error(`  ${tool.name}  ${JSON.stringify(tool.annotations ?? null)}`);
  }
  console.error('\n  Add `annotations` beside `title` in src/mcp.');
  process.exit(1);
}

const snapshots = [
  { label: 'tools', file: SNAPSHOT, listed: tools },
  { label: 'local-only tools', file: LOCAL_SNAPSHOT, listed: localTools },
].map(({ label, file, listed }) => {
  listed.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const rawDigest = createHash('sha256').update(JSON.stringify(listed)).digest('hex').slice(0, 16);
  console.log(`  ${label}: ${listed.length} · raw digest: ${rawDigest}`);
  const text = `${JSON.stringify(canonical({ toolCount: listed.length, tools: listed }), null, 2)}\n`;
  return { file, text };
});

if (update) {
  for (const { file, text } of snapshots) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    console.log(`✓ wrote ${path.relative(ROOT, file)}`);
  }
  process.exit(0);
}

for (const { file } of snapshots) {
  if (!fs.existsSync(file)) {
    bail(
      `${path.relative(ROOT, file)} is missing`,
      'Run `pnpm schemas:update` once to record the current contract, and review what it writes.',
    );
  }
}

let differs = false;
for (const { file, text } of snapshots) {
  const committed = fs.readFileSync(file, 'utf8');
  if (committed === text) continue;
  differs = true;

  console.error(`✗ tool schemas differ from the recorded contract in ${path.relative(ROOT, file)}`);
  console.error('');

  const a = committed.split('\n');
  const b = text.split('\n');
  let shown = 0;
  for (let i = 0; i < Math.max(a.length, b.length) && shown < 40; i++) {
    if (a[i] === b[i]) continue;
    if (a[i] !== undefined) console.error(`  -${a[i]}`);
    if (b[i] !== undefined) console.error(`  +${b[i]}`);
    shown++;
  }
  if (shown >= 40) console.error('  ... more differences not shown');
  console.error('');
}

if (!differs) {
  console.log('✓ tool schemas match the recorded contract');
  process.exit(0);
}

console.error('  This is what every agent reads before calling a tool. If the change is');
console.error('  intended, run `pnpm schemas:update` and review the diff in the same commit.');
process.exit(1);
