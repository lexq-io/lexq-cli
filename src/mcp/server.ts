import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { McpServer } from '@modelcontextprotocol/server';
import { createCallApiFromConfig } from './tools/_shared';
import { registerAllTools } from './register';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
    return pkg.version as string;
  } catch {
    return '0.1.0';
  }
}

/**
 * Starts the stdio MCP server.
 *
 * `serveStdio` decides the protocol era from the opening exchange and pins the connection to
 * it. Wiring a `StdioServerTransport` by hand instead, as this did before, only ever serves
 * 2025: the version is negotiated during `initialize` against a fixed list, and 2026-07-28 is
 * not in it. A 2026 client got no error from that, only a 2025 answer without the response
 * envelope it expects.
 *
 * One factory serves both eras. Tools are registered once, so the two cannot drift.
 *
 * `legacy` stays at its default of `'serve'`. The clients that run this today speak 2025.
 */
export function startMcpServer(): void {
  const version = getVersion();
  const callApi = createCallApiFromConfig();

  serveStdio(
    () => {
      const server = new McpServer({ name: 'lexq', version });
      registerAllTools(server, callApi);
      return server;
    },
    {
      /* stdout carries the protocol. Anything written there that is not a JSON-RPC message
         breaks the client's parser, so this goes to stderr — the only channel a stdio server
         can report on. Without it a transport that fails to start does so silently. */
      onerror: (error) => {
        console.error('[lexq mcp]', error.message);
      },
    },
  );
}
