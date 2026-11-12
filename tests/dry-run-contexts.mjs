#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// LexQ CLI — Dry Run Contexts Test
// ═══════════════════════════════════════════════════════════════
//
// The MCP tools lexq_dry_run and lexq_dry_run_compare take an optional contexts argument (a
// JSON string, like facts). The request body carries contexts only when the argument is given,
// so a call without it sends no contexts field.
//
// The dry-run endpoints reject unknown fields with C-001 (HTTP 400), so a body that carries
// contexts is also checked against the fields its endpoint takes.
//
// Everything runs in memory: the tools are registered on an in-memory server, and callApi
// records the request instead of reaching the network.
//
// Usage:
//   pnpm build && node tests/dry-run-contexts.mjs
// ═══════════════════════════════════════════════════════════════

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { McpServer, InMemoryTransport } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';

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

if (!existsSync(TOOLS)) {
  console.error(`\n  ${RED}dist/ is missing — run pnpm build first${NC}\n`);
  process.exit(1);
}

const { registerAllTools } = await import(TOOLS);

/** Requests the tools sent to the stub. request() empties it before each call. */
const sent = [];
const server = new McpServer({ name: 'dry-run-contexts-test', version: '0.0.0' });
registerAllTools(server, async (method, path, opts) => {
  sent.push({ method, path, body: opts?.body });
  return { content: [{ type: 'text', text: '{}' }] };
});
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: 'dry-run-contexts-test', version: '0.0.0' });
await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

// The tools validate RFC 9562 UUIDs (version and variant bits), so these are valid v4 values.
const VERSION_A = '3f2c8e1a-5b7d-4c9e-8f1a-2b3c4d5e6f70';
const VERSION_B = '9a8b7c6d-1e2f-4a3b-9c4d-5e6f7a8b9c0d';
const FACTS = '{"amount":100}';

/** Fields each dry-run endpoint takes. Any other field is rejected with C-001 (400). */
const DRY_RUN_FIELDS = ['facts', 'contexts', 'includeDebugInfo'];
const COMPARE_FIELDS = ['facts', 'contexts', 'versionIdA', 'versionIdB'];

/** Calls a tool and returns its result with the request it sent. A thrown call counts as an error result. */
async function request(name, args) {
  sent.length = 0;
  let result;
  try {
    result = await client.callTool({ name, arguments: args }, { timeout: 10_000 });
  } catch (error) {
    result = { isError: true, thrown: String(error) };
  }
  return { result, call: sent[0] };
}

const onlyFields = (body, fields) =>
  body !== undefined && Object.keys(body).every((field) => fields.includes(field));

console.log(`\n${DIM}  lexq_dry_run${NC}\n`);

{
  const { result, call } = await request('lexq_dry_run', {
    versionId: VERSION_A,
    facts: FACTS,
    contexts: '{"trafficKey":"customer-1","channel":"web"}',
  });
  check(
    'sends contexts as an object',
    JSON.stringify(call?.body?.contexts) === '{"trafficKey":"customer-1","channel":"web"}',
    JSON.stringify(call?.body),
  );
  check(
    'keeps facts and includeDebugInfo',
    JSON.stringify(call?.body?.facts) === FACTS && call?.body?.includeDebugInfo === true,
    JSON.stringify(call?.body),
  );
  check(
    'posts to the dry-run path',
    call?.method === 'POST' && call?.path === `analytics/dry-run/versions/${VERSION_A}`,
    `${call?.method} ${call?.path} result=${JSON.stringify(result).slice(0, 300)}`,
  );
  check(
    'sends only fields the endpoint takes',
    onlyFields(call?.body, DRY_RUN_FIELDS),
    JSON.stringify(call?.body),
  );
}

{
  const { call } = await request('lexq_dry_run', { versionId: VERSION_A, facts: FACTS });
  check(
    'without contexts, sends no contexts field',
    call?.body !== undefined && !('contexts' in call.body),
    JSON.stringify(call?.body),
  );
}

{
  const { result, call } = await request('lexq_dry_run', {
    versionId: VERSION_A,
    facts: FACTS,
    contexts: '{"channel":',
  });
  check(
    'a contexts argument that is not valid JSON never reaches the API',
    call === undefined && result?.isError === true,
    `sent=${JSON.stringify(call)} isError=${result?.isError}`,
  );
}

console.log(`\n${DIM}  lexq_dry_run_compare${NC}\n`);

{
  const { call } = await request('lexq_dry_run_compare', {
    versionIdA: VERSION_A,
    versionIdB: VERSION_B,
    facts: FACTS,
    contexts: '{"channel":"web"}',
  });
  check(
    'sends contexts as an object',
    JSON.stringify(call?.body?.contexts) === '{"channel":"web"}',
    JSON.stringify(call?.body),
  );
  check(
    'keeps both versions and facts',
    call?.body?.versionIdA === VERSION_A &&
      call?.body?.versionIdB === VERSION_B &&
      JSON.stringify(call?.body?.facts) === FACTS,
    JSON.stringify(call?.body),
  );
  check(
    'sends only fields the endpoint takes',
    onlyFields(call?.body, COMPARE_FIELDS),
    JSON.stringify(call?.body),
  );
}

{
  const { call } = await request('lexq_dry_run_compare', {
    versionIdA: VERSION_A,
    versionIdB: VERSION_B,
    facts: FACTS,
  });
  check(
    'without contexts, sends no contexts field',
    call?.body !== undefined && !('contexts' in call.body),
    JSON.stringify(call?.body),
  );
}

await client.close();
await server.close();

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
