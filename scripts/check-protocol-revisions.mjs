#!/usr/bin/env node
/**
 * check-protocol-revisions.mjs — keeps the README honest about which MCP revisions the
 * server actually serves.
 *
 * The README states two revision strings. They are not this repository's to choose: the
 * SDK decides them, and a dependency bump can change both without touching a line here.
 * Prose that nothing watches drifts, and this prose is a capability claim on a public
 * package.
 *
 * Where the two answers come from:
 *
 *   modern  The server is asked. A `tools/list` carrying an envelope that claims a revision
 *           nothing supports is refused, and the refusal names the revisions the server does
 *           support. That is its own answer over its own wire, not a constant read out of a
 *           private module path.
 *   legacy  `LATEST_PROTOCOL_VERSION`, which the SDK exports publicly.
 *
 * The section is then required to name exactly those and nothing else. A revision string
 * left behind after an upgrade fails the same way a missing one does.
 *
 * Usage:  node scripts/check-protocol-revisions.mjs
 * Exit:   0 = the README matches, 1 = it does not, 2 = the check could not run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LATEST_PROTOCOL_VERSION, McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const README = path.join(ROOT, 'README.md');
const HEADING = '## Protocol Support';

const PROTOCOL_VERSION_META = 'io.modelcontextprotocol/protocolVersion';
const CLIENT_CAPABILITIES_META = 'io.modelcontextprotocol/clientCapabilities';
/* Any string the SDK cannot support. The answer to it is the list this check wants. */
const IMPOSSIBLE = '1970-01-01';

function bail(message, hint) {
  console.error(`✗ ${message}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(2);
}

/** A transport that carries one message in and collects what comes back. */
function scriptedTransport(inbound) {
  const replies = [];
  const transport = {
    replies,
    async start() {
      queueMicrotask(() => transport.onmessage?.(inbound));
    },
    async send(message) {
      replies.push(message);
    },
    async close() {
      transport.onclose?.();
    },
  };
  return transport;
}

/** The modern revisions the server admits to, asked over the wire. */
async function servedModernRevisions() {
  const transport = scriptedTransport({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {
      _meta: { [PROTOCOL_VERSION_META]: IMPOSSIBLE, [CLIENT_CAPABILITIES_META]: {} },
    },
  });

  const handle = serveStdio(() => new McpServer({ name: 'probe', version: '0.0.0' }), {
    transport,
    onerror: () => {},
  });

  // The refusal is written synchronously once the message lands; a turn of the loop is enough.
  await new Promise((resolve) => setTimeout(resolve, 100));
  await handle.close();

  const refusal = transport.replies.find((m) => m.id === 1 && m.error);
  if (!refusal) {
    bail(
      `the server answered ${IMPOSSIBLE} without an error`,
      'This check reads the refusal. If the SDK stopped refusing unknown revisions, it needs rewriting.',
    );
  }

  const supported = refusal.error.data?.supported;
  if (!Array.isArray(supported) || supported.length === 0) {
    bail(
      'the refusal carried no list of supported revisions',
      `Got: ${JSON.stringify(refusal.error.data)}`,
    );
  }
  return supported;
}

const expected = [...(await servedModernRevisions()), LATEST_PROTOCOL_VERSION];

const readme = fs.readFileSync(README, 'utf8');
const start = readme.indexOf(HEADING);
if (start === -1) bail(`README.md has no "${HEADING}" section`);
const rest = readme.slice(start + HEADING.length);
const nextHeading = rest.search(/\n## /);
const section = nextHeading === -1 ? rest : rest.slice(0, nextHeading);

const stated = [...new Set(section.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [])];

const missing = expected.filter((v) => !stated.includes(v));
const extra = stated.filter((v) => !expected.includes(v));

if (missing.length === 0 && extra.length === 0) {
  console.log(`✓ protocol revisions — README states ${expected.join(' and ')}`);
  process.exit(0);
}

console.error('✗ protocol revisions — README disagrees with what the server serves\n');
if (missing.length > 0) console.error(`  served but not stated: ${missing.join(', ')}`);
if (extra.length > 0) console.error(`  stated but not served: ${extra.join(', ')}`);
console.error(`\n  Fix the "${HEADING}" section of README.md.`);
process.exit(1);
