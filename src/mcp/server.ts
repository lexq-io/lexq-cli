import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
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

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: 'lexq',
    version: getVersion(),
  });

  const callApi = createCallApiFromConfig();
  registerAllTools(server, callApi);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
