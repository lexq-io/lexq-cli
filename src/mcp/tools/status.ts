import type { McpServer } from '@modelcontextprotocol/server';
import type { CallApi } from './_shared';
import { z } from 'zod';

export function registerStatusTools(server: McpServer, callApi: CallApi): void {
  server.registerTool(
    'lexq_whoami',
    {
      title: 'Who Am I',
      description: 'Show current authentication info (tenant ID, user ID, role).',
      inputSchema: z.object({}),
    },
    async () => callApi('GET', 'whoami'),
  );
}
