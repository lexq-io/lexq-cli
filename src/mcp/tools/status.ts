import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { callApi } from './_shared';

export function registerStatusTools(server: McpServer): void {
    server.registerTool(
        'lexq_whoami',
        {
            title: 'Who Am I',
            description: 'Show current authentication info (tenant name, role, API key mask).',
            inputSchema: {},
        },
        async () => callApi('GET', 'whoami')
    );
}