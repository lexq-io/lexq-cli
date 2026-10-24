#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// LexQ CLI — Rollback Expectations Test
// ═══════════════════════════════════════════════════════════════
//
// A rollback restores the version that the group's current deployment replaced, as of
// the moment the request arrives. If someone else deployed or rolled back after the
// caller read the group, the rollback undoes that newer change. The request can carry
// what the caller read (expectedCurrentVersionId, expectedCurrentDeploymentId), and the
// server then answers 409 if the group has changed since.
//
// `lexq deploy rollback` sends each value only when its option was passed. The MCP tool
// lexq_deploy_rollback requires both and forwards them unchanged.
//
// The CLI half reads the request body out of `--dry-run`, so it never touches the network.
// The MCP half calls the built tool through an in-memory client with a stub in place of
// the API.
//
// Usage:
//   pnpm build && node tests/rollback.mjs
// ═══════════════════════════════════════════════════════════════

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { McpServer, InMemoryTransport } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';

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

// Valid RFC 9562 UUIDs. The tools validate their ids, so a malformed one is refused before
// the handler runs, and a refusal test would then pass for the wrong reason.
const GROUP = '11111111-1111-4111-8111-111111111111';
const VERSION = '22222222-2222-4222-8222-222222222222';
const DEPLOYMENT = '33333333-3333-4333-8333-333333333333';

/** The body `lexq deploy rollback` would send, or `null` when none was printed. */
function body(flags) {
  const r = spawnSync(
    process.execPath,
    [
      CLI,
      '--dry-run',
      '--api-key',
      'test',
      'deploy',
      'rollback',
      '--group-id',
      GROUP,
      '--memo',
      'revert',
      '--force',
      ...flags,
    ],
    { encoding: 'utf8' },
  );
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const start = out.indexOf('{');
  const end = out.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(out.slice(start, end + 1));
  } catch {
    return null;
  }
}

console.log(`\n${DIM}  lexq deploy rollback${NC}\n`);

const both = body([
  '--expected-current-version-id',
  VERSION,
  '--expected-current-deployment-id',
  DEPLOYMENT,
]);
check(
  'both options send both expected values',
  both?.memo === 'revert' &&
    both.expectedCurrentVersionId === VERSION &&
    both.expectedCurrentDeploymentId === DEPLOYMENT,
  JSON.stringify(both),
);

const deploymentOnly = body(['--expected-current-deployment-id', DEPLOYMENT]);
check(
  'one option sends only its value',
  deploymentOnly?.expectedCurrentDeploymentId === DEPLOYMENT &&
    !('expectedCurrentVersionId' in deploymentOnly),
  JSON.stringify(deploymentOnly),
);

const neither = body([]);
check(
  'without the options, neither expected value is sent',
  neither !== null &&
    neither.memo === 'revert' &&
    !('expectedCurrentVersionId' in neither) &&
    !('expectedCurrentDeploymentId' in neither),
  JSON.stringify(neither),
);

console.log(`\n${DIM}  lexq_deploy_rollback${NC}\n`);

const { registerAllTools } = await import(TOOLS);
const calls = [];
const server = new McpServer({ name: 'rollback-test', version: '0.0.0' });
registerAllTools(server, async (method, path, opts) => {
  calls.push({ method, path, body: opts?.body });
  return { content: [{ type: 'text', text: '{}' }] };
});
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: 'rollback-test', version: '0.0.0' });
await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

const sent = await client.callTool({
  name: 'lexq_deploy_rollback',
  arguments: {
    groupId: GROUP,
    expectedCurrentVersionId: VERSION,
    expectedCurrentDeploymentId: DEPLOYMENT,
    memo: 'revert',
  },
});
check(
  'the tool forwards both expected values',
  calls.length === 1 &&
    calls[0].method === 'POST' &&
    calls[0].path === `policy-groups/${GROUP}/rollback` &&
    calls[0].body?.expectedCurrentVersionId === VERSION &&
    calls[0].body?.expectedCurrentDeploymentId === DEPLOYMENT &&
    calls[0].body?.memo === 'revert',
  `calls=${JSON.stringify(calls)} result=${JSON.stringify(sent)}`,
);

/* The SDK answers an argument error with a tool result marked isError. A thrown error
   counts as a refusal too. Either way the API must not be called. */
calls.length = 0;
let refused = false;
try {
  const result = await client.callTool({
    name: 'lexq_deploy_rollback',
    arguments: { groupId: GROUP, memo: 'revert' },
  });
  refused = result.isError === true;
} catch {
  refused = true;
}
check(
  'the tool refuses a call without the expected values',
  refused && calls.length === 0,
  `refused=${refused} calls=${JSON.stringify(calls)}`,
);

await client.close();
await server.close();

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
