#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// LexQ CLI — Export Limit Test
// ═══════════════════════════════════════════════════════════════
//
// The three export tools return a whole file as text. A file longer than the limit their
// descriptions state is refused rather than cut, because a cut file reads as the whole thing.
// The refusal says where to download the file instead.
//
// A file comes back as the engine sent it. The local server used to return it as a JSON
// string: one quoted line, with its line breaks and quotes escaped.
//
// Everything talks to a fake engine on 127.0.0.1. The local server is the built binary over
// stdio, started with its own HOME so the developer's ~/.lexq/config.json stays out of it.
//
// Usage:
//   pnpm build && node tests/export-limit.mjs
// ═══════════════════════════════════════════════════════════════

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer, InMemoryTransport } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const CLI = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const TOOLS = fileURLToPath(new URL('../dist/mcp/register.js', import.meta.url));

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

if (!existsSync(CLI) || !existsSync(TOOLS)) {
  console.error(`\n  ${RED}dist/ is missing — run pnpm build first${NC}\n`);
  process.exit(1);
}

const KEY = 'test-key-0123456789';
/** Written into every file below. Finding it in a refusal means the file leaked into it. */
const MARKER = 'export-marker-7c2e';
const SIMULATION_ID = '00000000-0000-4000-8000-000000000001';
const JOB_ID = 'replay-job-1';
const EXPORT_TOOLS = ['lexq_facts_export', 'lexq_simulation_export', 'lexq_replay_export'];

/** A CSV of exactly `length` characters, with quotes, commas and line breaks. */
function csvOf(length) {
  const head = `Key,Name\nmarker,"${MARKER}, quoted"\n`;
  const row = 'paymentAmount,"Payment, Amount"\n';
  return (head + row.repeat(Math.ceil(length / row.length))).slice(0, length);
}

/** JSON the way the engine writes an export: indented, with a space before each colon. */
const JSON_FILE = `[ {\n  "key" : "paymentAmount",\n  "note" : "${MARKER}"\n} ]`;

// ── Fake engine ──
// Answers each request with what `next` holds: a file the way the engine sends one, the body as
// is under Content-Disposition: attachment, or an error envelope.

let next = null;
const engine = createServer((req, res) => {
  if (next?.error) {
    res.writeHead(409, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({ result: 'ERROR', data: null, errorCode: 'TEST-409', message: next.error }),
    );
    return;
  }
  const type = next?.type ?? 'text/csv';
  res.writeHead(200, {
    'content-type': type,
    'content-disposition': `attachment; filename="export.${type === 'text/csv' ? 'csv' : 'json'}"`,
  });
  res.end(next?.body ?? '');
});
await new Promise((resolve) => engine.listen(0, '127.0.0.1', resolve));
const BASE = `http://127.0.0.1:${engine.address().port}/api/v1/partners`;

function texts(result) {
  return (result?.content ?? []).map((c) => c.text ?? '').join('\n');
}

function show(result) {
  return `isError=${result.isError === true} text=${JSON.stringify(texts(result).slice(0, 200))}`;
}

const home = mkdtempSync(join(tmpdir(), 'export-limit-test-'));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [CLI, 'serve', '--mcp'],
  cwd: home,
  env: { HOME: home, LEXQ_API_KEY: KEY, PARTNER_BASE_URL: BASE },
  stderr: 'pipe',
});
let serverLog = '';
transport.stderr?.on('data', (chunk) => (serverLog += chunk));
const local = new Client({ name: 'export-limit-test', version: '0.0.0' });
await local.connect(transport);

/** Calls a tool on the local server while the fake engine answers with `answer`. */
async function call(name, args, answer) {
  next = answer;
  return local.callTool({ name, arguments: args }, { timeout: 10_000 });
}

// ── The limit the descriptions state ──

console.log(`\n${DIM}  tool descriptions${NC}\n`);

const listed = (await local.listTools()).tools;
const stated = EXPORT_TOOLS.map((name) => {
  const description = listed.find((tool) => tool.name === name)?.description ?? '';
  return /An export longer than ([\d,]+) characters is refused\./.exec(description)?.[1];
});
check(
  'every export tool states the same limit',
  stated.every((value) => value !== undefined && value === stated[0]),
  JSON.stringify(stated),
);
const LIMIT = Number((stated[0] ?? '').replaceAll(',', ''));
if (!Number.isInteger(LIMIT) || LIMIT <= 0) {
  console.error(`\n  ${RED}No limit to test against: ${JSON.stringify(stated)}${NC}\n`);
  process.exit(1);
}
const count = (n) => n.toLocaleString('en-US');

// ── The local server ──

console.log(`\n${DIM}  lexq serve --mcp${NC}\n`);

{
  const file = csvOf(200);
  const result = await call('lexq_facts_export', { format: 'csv' }, { body: file });
  check(
    'a CSV export comes back as the engine sent it',
    result.isError !== true && texts(result) === file,
    show(result),
  );
}

{
  const result = await call(
    'lexq_replay_export',
    { jobId: JOB_ID, format: 'json' },
    { type: 'application/json', body: JSON_FILE },
  );
  check(
    'a JSON export comes back as the engine sent it',
    result.isError !== true && texts(result) === JSON_FILE,
    show(result),
  );
}

{
  const file = csvOf(120);
  const result = await call(
    'lexq_dataset_template',
    { groupId: SIMULATION_ID, versionId: SIMULATION_ID, format: 'csv' },
    { body: file },
  );
  check(
    'a dataset template comes back as the engine sent it',
    result.isError !== true && texts(result) === file,
    show(result),
  );
}

{
  const file = csvOf(LIMIT);
  const result = await call(
    'lexq_simulation_export',
    { simulationId: SIMULATION_ID, format: 'csv' },
    { body: file },
  );
  check(
    `an export of exactly ${count(LIMIT)} characters comes back whole`,
    result.isError !== true && texts(result) === file,
    show(result),
  );
}

const over = csvOf(LIMIT + 1);
const refusals = [
  {
    name: 'lexq_facts_export',
    args: { format: 'csv' },
    command: 'lexq facts export --as csv --output <file>',
  },
  {
    name: 'lexq_simulation_export',
    args: { simulationId: SIMULATION_ID, format: 'csv' },
    command: `lexq analytics simulation export --id ${SIMULATION_ID} --as csv --output <file>`,
  },
  {
    name: 'lexq_replay_export',
    args: { jobId: JOB_ID, format: 'csv' },
    command: `lexq replay export --id ${JOB_ID} --as csv --output <file>`,
  },
];

for (const { name, args, command } of refusals) {
  const result = await call(name, args, { body: over });
  const text = texts(result);
  check(
    `${name}: ${count(LIMIT + 1)} characters is refused with its size and where to download it`,
    result.isError === true &&
      text.includes(`The export is ${count(LIMIT + 1)} characters long`) &&
      text.includes('https://console.lexq.io') &&
      text.includes(command) &&
      !text.includes(MARKER),
    show(result),
  );
}

{
  const result = await call('lexq_facts_export', { format: 'csv' }, { body: over });
  check(
    'the fact export refusal says a keyword exports fewer facts',
    texts(result).includes('Pass keyword to export fewer facts.'),
    show(result),
  );
}

{
  // Longer than the limit, so that only the error check keeps it from being taken for an export.
  const message = `the job has not completed ${'.'.repeat(LIMIT)}`;
  const result = await call(
    'lexq_replay_export',
    { jobId: JOB_ID, format: 'json' },
    { error: message },
  );
  check(
    "the engine's refusal comes back as it was, however long, not as a size refusal",
    result.isError === true &&
      texts(result).includes(message) &&
      !texts(result).includes('characters long'),
    show(result),
  );
}

await local.close();

// ── The hosted surface ──
// The hosted server registers the same tools with a CallApi of its own, so the limit has to hold
// in the tool, whatever the CallApi returns.

console.log(`\n${DIM}  registerAllTools (what the hosted server registers)${NC}\n`);

const { registerAllTools } = await import(TOOLS);

async function hostedExport(text) {
  const server = new McpServer({ name: 'export-limit-test', version: '0.0.0' });
  registerAllTools(server, async () => ({ content: [{ type: 'text', text }] }));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'export-limit-test', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const result = await client.callTool({
    name: 'lexq_replay_export',
    arguments: { jobId: JOB_ID, format: 'csv' },
  });
  await client.close();
  await server.close();
  return result;
}

{
  const file = csvOf(LIMIT);
  const result = await hostedExport(file);
  check(
    `an export of ${count(LIMIT)} characters passes through unchanged`,
    result.isError !== true && texts(result) === file,
    show(result),
  );
}

{
  const result = await hostedExport(over);
  check(
    `an export of ${count(LIMIT + 1)} characters is refused`,
    result.isError === true &&
      texts(result).includes(`The export is ${count(LIMIT + 1)} characters long`),
    show(result),
  );
}

engine.close();
rmSync(home, { recursive: true, force: true });

if (fail > 0 && serverLog.trim()) {
  console.log(`\n${DIM}  local server stderr:${NC}\n${serverLog.trim()}`);
}
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
