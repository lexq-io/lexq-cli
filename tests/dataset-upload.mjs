#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// LexQ CLI — Dataset Upload Test
// ═══════════════════════════════════════════════════════════════
//
// A dataset reaches the API three ways: `lexq analytics dataset upload --file`, the MCP
// tool lexq_dataset_upload with the content inline, and lexq_dataset_upload_file, which
// only the local server registers and which reads a file the model names.
//
// The last one reads from disk because a model asked, so most of this file is about what
// it refuses: a relative path, a path that starts with two separators, a name that does not
// end in .csv or .json, a symbolic link to such a file, a JSON file holding an object,
// anything but a regular file, and a file over the engine's limit. A refused file never
// reaches the API, and no answer carries a file's content.
//
// Everything talks to a fake engine on 127.0.0.1. The local server is the built binary over
// stdio, started with its own HOME so the developer's ~/.lexq/config.json stays out of it.
//
// Usage:
//   pnpm build && node tests/dataset-upload.mjs
// ═══════════════════════════════════════════════════════════════

import { execFileSync, spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer, InMemoryTransport } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const CLI = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const TOOLS = fileURLToPath(new URL('../dist/mcp/register.js', import.meta.url));
const MANIFEST = fileURLToPath(new URL('../contracts/lexq-manifest.cli.json', import.meta.url));

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

/** The engine's upload limit in bytes, from the same manifest the generated constants come from. */
const MAX = JSON.parse(readFileSync(MANIFEST, 'utf8')).constants.MAX_DATASET_SIZE;
const KEY = 'test-key-0123456789';
/** Written into every file below. Finding it in an answer means a file's content leaked. */
const MARKER = 'content-marker-5d1c';

// ── Fake engine ──
// Records each upload and answers like the engine: the stored path inside an envelope. A file
// whose name starts with "refused" gets the engine's error envelope instead. Names starting with
// "proxy-" get what a proxy in front of the engine can send: a 413 with no body and no
// Content-Type, or a 502 page in HTML.

const requests = [];
const engine = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const record = { method: req.method, url: req.url, apiKey: req.headers['x-api-key'] };
  try {
    const form = await new Request('http://engine.test/', {
      method: 'POST',
      headers: { 'content-type': req.headers['content-type'] ?? '' },
      body: Buffer.concat(chunks),
    }).formData();
    const file = form.get('file');
    record.filename = file.name;
    record.type = file.type;
    record.bytes = Buffer.from(await file.arrayBuffer());
  } catch (error) {
    record.parseError = error.message;
  }
  requests.push(record);

  if (record.filename?.startsWith('proxy-413')) {
    res.statusCode = 413;
    res.end();
    return;
  }
  if (record.filename?.startsWith('proxy-502')) {
    res.writeHead(502, { 'content-type': 'text/html' });
    res.end('<html><body><h1>502 Bad Gateway</h1></body></html>');
    return;
  }

  res.setHeader('content-type', 'application/json');
  if (record.filename?.startsWith('refused')) {
    res.statusCode = 400;
    res.end(
      JSON.stringify({
        result: 'ERROR',
        data: null,
        errorCode: 'TEST-400',
        message: 'refused by the test engine',
      }),
    );
    return;
  }
  res.end(
    JSON.stringify({
      result: 'SUCCESS',
      data: {
        path: `datasets/test/${requests.length}${extname(record.filename ?? '').toLowerCase()}`,
        filename: record.filename,
        size: record.bytes?.length,
        contentType: record.type,
      },
      errorCode: null,
      message: null,
    }),
  );
});
await new Promise((resolve) => engine.listen(0, '127.0.0.1', resolve));
const BASE = `http://127.0.0.1:${engine.address().port}/api/v1/partners`;
const UPLOAD_URL = '/api/v1/partners/analytics/datasets/upload';

// ── Files ──

const root = mkdtempSync(join(tmpdir(), 'dataset-upload-test-'));
const home = join(root, 'home');
mkdirSync(home);
const at = (name) => join(home, name);

const csv = Buffer.from(`userId,amount\nuser_001,${MARKER}\n`);
writeFileSync(at('data.csv'), csv);
writeFileSync(at('data.json'), JSON.stringify([{ userId: 'user_001', note: MARKER }]));
const bomJson = Buffer.concat([
  Buffer.from([0xef, 0xbb, 0xbf]),
  Buffer.from(`\n  [{"userId":"user_001","note":"${MARKER}"}]`),
]);
writeFileSync(at('bom.json'), bomJson);
// The shape of a key or configuration file: one object.
const keyFile = JSON.stringify({ auths: { 'registry.test': { auth: MARKER } } });
writeFileSync(at('config.json'), keyFile);
// A name of its own, not CONFIG.JSON: macOS would take that for config.json.
writeFileSync(at('KEYS.JSON'), keyFile);
writeFileSync(at('UPPER.CSV'), csv);
writeFileSync(at('secret'), `token=${MARKER}\n`);
writeFileSync(at('refused.csv'), csv);
writeFileSync(at('proxy-413.csv'), csv);
writeFileSync(at('proxy-502.csv'), csv);
mkdirSync(at('sub'));
writeFileSync(at('sub/data.csv'), csv);
symlinkSync(at('secret'), at('link.csv'));
symlinkSync(at('data.csv'), at('alias.csv'));
symlinkSync(at('config.json'), at('innocent.csv'));
mkdirSync(at('dir.csv'));
// Extended with truncate: the size is real, and the file system need not store the zeros.
writeFileSync(at('limit.csv'), '');
truncateSync(at('limit.csv'), MAX);
writeFileSync(at('over.csv'), '');
truncateSync(at('over.csv'), MAX + 1);
const fifo = process.platform === 'win32' ? null : at('pipe.csv');
if (fifo) execFileSync('mkfifo', [fifo]);

function texts(result) {
  return (result?.content ?? []).map((c) => c.text ?? '').join('\n');
}

const answers = [];

/** Calls a tool and returns what it answered and what reached the engine during the call. */
async function call(client, name, args) {
  const before = requests.length;
  let result;
  try {
    result = await client.callTool({ name, arguments: args }, { timeout: 10_000 });
  } catch (error) {
    result = { thrown: error.message };
  }
  answers.push(texts(result));
  return { result, sent: requests.slice(before), text: texts(result) };
}

function refused(outcome, phrase) {
  return (
    outcome.result.isError === true && outcome.text.includes(phrase) && outcome.sent.length === 0
  );
}

function show(outcome) {
  return `result=${JSON.stringify(outcome.result).slice(0, 300)} sent=${outcome.sent.length}`;
}

// ── The hosted surface ──

console.log(`\n${DIM}  registerAllTools (what the hosted server registers)${NC}\n`);

const { registerAllTools } = await import(TOOLS);

async function connectInMemory(callApi) {
  const server = new McpServer({ name: 'dataset-upload-test', version: '0.0.0' });
  registerAllTools(server, callApi);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'dataset-upload-test', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

{
  const { client, server } = await connectInMemory(async () => {
    throw new Error('not reached');
  });
  const names = (await client.listTools()).tools.map((tool) => tool.name);
  check(
    'registerAllTools does not register lexq_dataset_upload_file',
    names.includes('lexq_dataset_upload') && !names.includes('lexq_dataset_upload_file'),
    JSON.stringify(names.filter((name) => name.startsWith('lexq_dataset'))),
  );
  await client.close();
  await server.close();
}

check(
  'the library bundle has no lexq_dataset_upload_file registration',
  !/registerTool\(\s*["'`]lexq_dataset_upload_file/.test(readFileSync(TOOLS, 'utf8')),
);

/* The hosted server answers with the whole response, so the stored path sits under `data`. */
{
  const { client, server } = await connectInMemory(async () => ({
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          result: 'SUCCESS',
          data: {
            path: 'datasets/hosted/1.csv',
            filename: 'a.csv',
            size: 4,
            contentType: 'text/plain',
          },
          errorCode: null,
          message: null,
        }),
      },
    ],
  }));
  const result = await client.callTool({
    name: 'lexq_dataset_upload',
    arguments: { content: 'a,b\n', filename: 'a.csv' },
  });
  check(
    'lexq_dataset_upload adds the dataset block when the path comes inside the envelope',
    texts(result).includes('"path": "datasets/hosted/1.csv"') &&
      texts(result).includes('Ready-to-use dataset block'),
    texts(result),
  );
  await client.close();
  await server.close();
}

// ── The local server ──

console.log(`\n${DIM}  lexq serve --mcp${NC}\n`);

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [CLI, 'serve', '--mcp'],
  cwd: home,
  env: { HOME: home, LEXQ_API_KEY: KEY, PARTNER_BASE_URL: BASE },
  stderr: 'pipe',
});
let serverLog = '';
transport.stderr?.on('data', (chunk) => (serverLog += chunk));
const local = new Client({ name: 'dataset-upload-test', version: '0.0.0' });
await local.connect(transport);

const listed = (await local.listTools()).tools.map((tool) => tool.name);
check(
  'the local server registers lexq_dataset_upload_file',
  listed.includes('lexq_dataset_upload_file'),
);

{
  const outcome = await call(local, 'lexq_dataset_upload_file', { file: at('data.csv') });
  const sent = outcome.sent[0];
  const answer = (() => {
    try {
      return JSON.parse(outcome.result.content[0].text);
    } catch {
      return null;
    }
  })();
  check(
    'a CSV file goes up as text/csv, byte for byte, with the key from the environment',
    outcome.sent.length === 1 &&
      sent.url === UPLOAD_URL &&
      sent.apiKey === KEY &&
      sent.filename === 'data.csv' &&
      sent.type === 'text/csv' &&
      sent.bytes.equals(csv),
    show(outcome),
  );
  check(
    'the answer is the stored path and the dataset block for lexq_simulation_start',
    answer?.path === 'datasets/test/' + requests.length + '.csv' &&
      answer.filename === 'data.csv' &&
      outcome.result.isError !== true &&
      outcome.text.includes('Ready-to-use dataset block') &&
      outcome.text.includes(`"path": "${answer.path}"`),
    show(outcome),
  );
}

{
  const outcome = await call(local, 'lexq_dataset_upload_file', { file: at('data.json') });
  check(
    'a JSON file goes up as application/json',
    outcome.sent.length === 1 &&
      outcome.sent[0].type === 'application/json' &&
      outcome.sent[0].filename === 'data.json',
    show(outcome),
  );
}

{
  const outcome = await call(local, 'lexq_dataset_upload_file', { file: at('bom.json') });
  check(
    'a JSON array after a byte order mark and whitespace goes up unchanged',
    outcome.sent.length === 1 && outcome.sent[0].bytes.equals(bomJson),
    show(outcome),
  );
}

{
  const outcome = await call(local, 'lexq_dataset_upload_file', { file: at('config.json') });
  check(
    'a JSON file holding an object, the shape of a key or config file, is refused',
    refused(outcome, 'array of records'),
    show(outcome),
  );
}

{
  const outcome = await call(local, 'lexq_dataset_upload_file', { file: at('KEYS.JSON') });
  check(
    'the object check matches the extension without regard to case',
    refused(outcome, 'array of records'),
    show(outcome),
  );
}

{
  const outcome = await call(local, 'lexq_dataset_upload_file', { file: at('innocent.csv') });
  check(
    'a .csv link to a JSON object is checked as the JSON it points to, and refused',
    refused(outcome, 'array of records'),
    show(outcome),
  );
}

{
  const outcome = await call(local, 'lexq_dataset_upload_file', { file: at('UPPER.CSV') });
  check(
    'the extension is matched without regard to case',
    outcome.sent.length === 1 && outcome.sent[0].type === 'text/csv',
    show(outcome),
  );
}

{
  const outcome = await call(local, 'lexq_dataset_upload_file', { file: '~/data.csv' });
  check(
    'a leading ~/ is the home directory',
    outcome.sent.length === 1 && outcome.sent[0].bytes.equals(csv),
    show(outcome),
  );
}

{
  const outcome = await call(local, 'lexq_dataset_upload_file', { file: at('alias.csv') });
  check(
    'a link to a CSV file sends that file under its own name',
    outcome.sent.length === 1 &&
      outcome.sent[0].filename === 'data.csv' &&
      outcome.sent[0].bytes.equals(csv),
    show(outcome),
  );
}

{
  const outcome = await call(local, 'lexq_dataset_upload_file', { file: at('limit.csv') });
  check(
    `a file of exactly ${MAX} bytes goes up`,
    outcome.sent.length === 1 && outcome.sent[0].bytes.length === MAX,
    show(outcome),
  );
}

{
  const outcome = await call(local, 'lexq_dataset_upload_file', { file: 'data.csv' });
  check(
    'a relative path is refused, even one that exists from the working directory',
    refused(outcome, 'absolute path'),
    show(outcome),
  );
}

{
  // On Windows two leading separators name a network share. Here the same path is a local file.
  const outcome = await call(local, 'lexq_dataset_upload_file', { file: `/${at('data.csv')}` });
  check(
    'a path that starts with two separators is refused, even one that is a local file here',
    refused(outcome, 'absolute path'),
    show(outcome),
  );
}

{
  const outcome = await call(local, 'lexq_dataset_upload_file', { file: at('secret') });
  check(
    'a file that does not end in .csv or .json is refused',
    refused(outcome, '.csv or .json'),
    show(outcome),
  );
}

{
  const outcome = await call(local, 'lexq_dataset_upload_file', { file: at('.ssh/id_rsa') });
  check(
    'the name is checked before the disk: a missing key file gets the same answer',
    refused(outcome, '.csv or .json'),
    show(outcome),
  );
}

{
  const outcome = await call(local, 'lexq_dataset_upload_file', { file: at('link.csv') });
  check(
    'a .csv link to a file that is not a dataset is refused',
    refused(outcome, '.csv or .json'),
    show(outcome),
  );
}

{
  const outcome = await call(local, 'lexq_dataset_upload_file', { file: at('over.csv') });
  check(`a file of ${MAX + 1} bytes is refused`, refused(outcome, 'larger than'), show(outcome));
}

{
  const outcome = await call(local, 'lexq_dataset_upload_file', { file: at('missing.csv') });
  check('a missing file is refused', refused(outcome, 'does not exist'), show(outcome));
}

{
  const outcome = await call(local, 'lexq_dataset_upload_file', { file: at('dir.csv') });
  check(
    'a directory named like a dataset is refused',
    refused(outcome, 'does not exist'),
    show(outcome),
  );
}

{
  const outcome = await call(local, 'lexq_dataset_upload_file', { file: at('refused.csv') });
  check(
    "the engine's refusal comes back as an error with its message",
    outcome.result.isError === true &&
      outcome.text.includes('refused by the test engine') &&
      outcome.sent.length === 1,
    show(outcome),
  );
}

{
  const outcome = await call(local, 'lexq_dataset_upload_file', { file: at('proxy-502.csv') });
  check(
    "a proxy's error page comes back as an error with its status",
    outcome.result.isError === true &&
      outcome.text.includes('status 502') &&
      !outcome.text.includes('<html>'),
    show(outcome),
  );
}

{
  const content = 'userId,amount\nuser_002,7\n';
  const outcome = await call(local, 'lexq_dataset_upload', { content, filename: 'inline.csv' });
  check(
    'inline content goes up as text/plain and the answer carries the dataset block',
    outcome.sent.length === 1 &&
      outcome.sent[0].type === 'text/plain' &&
      outcome.sent[0].bytes.toString('utf8') === content &&
      outcome.result.isError !== true &&
      outcome.text.includes('Ready-to-use dataset block'),
    show(outcome),
  );
}

{
  const outcome = await call(local, 'lexq_dataset_upload', {
    content: 'a\n',
    filename: 'refused.csv',
  });
  check(
    'an inline upload the engine refuses comes back as an error',
    outcome.result.isError === true && outcome.text.includes('refused by the test engine'),
    show(outcome),
  );
}

{
  const outcome = await call(local, 'lexq_dataset_upload', {
    content: 'a\n',
    filename: 'proxy-413.csv',
  });
  check(
    'an inline upload refused with no body comes back as an error with its status',
    outcome.result.isError === true && outcome.text.includes('status 413'),
    show(outcome),
  );
}

/* Last on this server: reading a FIFO would block a worker thread for good. */
if (fifo) {
  const outcome = await call(local, 'lexq_dataset_upload_file', { file: fifo });
  check(
    'a FIFO named like a dataset is refused without being read',
    refused(outcome, 'does not exist'),
    show(outcome),
  );
} else {
  console.log(`  ${DIM}SKIP a FIFO named like a dataset (no FIFOs on Windows)${NC}`);
}

check(
  'no answer carries the content of a file',
  answers.every((text) => !text.includes(MARKER)),
  answers.find((text) => text.includes(MARKER))?.slice(0, 200),
);

await local.close();

// ── The CLI ──

console.log(`\n${DIM}  lexq analytics dataset upload${NC}\n`);

function runCli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, '--api-key', KEY, '--base-url', BASE, ...args], {
      cwd: home,
      env: { PATH: process.env.PATH ?? '', HOME: home },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

{
  const before = requests.length;
  const run = await runCli(['--dry-run', 'analytics', 'dataset', 'upload', '--file', 'data.csv']);
  check(
    '--dry-run prints the file it would send and sends nothing',
    run.code === 0 &&
      requests.length === before &&
      run.stdout.includes(`file: data.csv (${csv.length} bytes, text/csv)`),
    `code=${run.code} sent=${requests.length - before} out=${run.stdout.slice(0, 300)}`,
  );
}

{
  const before = requests.length;
  const run = await runCli(['analytics', 'dataset', 'upload', '--file', 'data.csv']);
  const sent = requests[before];
  check(
    'a relative path from the working directory still works for the CLI',
    run.code === 0 &&
      requests.length === before + 1 &&
      sent.type === 'text/csv' &&
      sent.bytes.equals(csv) &&
      run.stdout.includes('✓ Dataset uploaded: datasets/test/'),
    `code=${run.code} out=${run.stdout.slice(0, 300)} err=${run.stderr.slice(0, 300)}`,
  );
}

{
  const run = await runCli(['analytics', 'dataset', 'upload', '--file', 'refused.csv']);
  check(
    "the CLI reports the engine's error code, message and status",
    run.code === 1 &&
      run.stderr.includes('"error": "TEST-400"') &&
      run.stderr.includes('refused by the test engine') &&
      run.stderr.includes('"status": 400'),
    `code=${run.code} err=${run.stderr.slice(0, 300)}`,
  );
}

{
  const run = await runCli(['analytics', 'dataset', 'upload', '--file', 'proxy-502.csv']);
  check(
    "the CLI reports the status of a proxy's error page",
    run.code === 1 && run.stderr.includes('"status": 502'),
    `code=${run.code} err=${run.stderr.slice(0, 300)}`,
  );
}

{
  const before = requests.length;
  const run = await runCli(['analytics', 'dataset', 'upload', '--file', 'sub/data.csv']);
  check(
    'the CLI sends the file name alone, never the path it was given',
    run.code === 0 && requests.length === before + 1 && requests[before].filename === 'data.csv',
    `code=${run.code} filename=${requests[before]?.filename}`,
  );
}

engine.close();
rmSync(root, { recursive: true, force: true });

if (fail > 0 && serverLog.trim()) {
  console.log(`\n${DIM}  local server stderr:${NC}\n${serverLog.trim()}`);
}
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
