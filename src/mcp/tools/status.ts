import type { McpServer } from '@modelcontextprotocol/server';
import type { CallApi } from './_shared';
import { z } from 'zod';

export function registerStatusTools(server: McpServer, callApi: CallApi): void {
  server.registerTool(
    'lexq_whoami',
    {
      title: 'Who Am I',
      annotations: { readOnlyHint: true },
      description:
        'Show current authentication info (tenant ID, user ID, role) and tenantTimezone, the organization time zone that every yyyy-MM-dd date filter uses. Work out "today" or "yesterday" in that zone, not in UTC.',
      inputSchema: z.object({}),
    },
    async () => callApi('GET', 'whoami'),
  );
}
