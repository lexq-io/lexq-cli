import { type Command } from 'commander';
import dedent from 'dedent';
import { apiRequest } from '@/lib/api-client';
import { printJson, printError } from '@/lib/output';
import type { WhoAmIResponse } from '@/types/auth';

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Check API connectivity and authentication')
    .addHelpText(
      'after',
      dedent`

        Example:
          $ lexq status
          { "status": "ok", "latencyMs": 142, "tenantId": "abc-123", "role": "ADMIN", "tenantTimezone": "Asia/Seoul" }

        Use this to verify your API key is valid and the LexQ API is reachable.
        tenantTimezone is the zone every yyyy-MM-dd date option is read in.
      `,
    )
    .action(async () => {
      const globalOpts = program.opts();
      const startTime = Date.now();
      try {
        const info = await apiRequest<WhoAmIResponse>('GET', 'whoami', {
          apiKey: globalOpts.apiKey,
          baseUrl: globalOpts.baseUrl,
        });
        printJson({
          status: 'ok',
          latencyMs: Date.now() - startTime,
          tenantId: info.tenantId,
          role: info.role,
          tenantTimezone: info.tenantTimezone,
        });
      } catch (error) {
        printError(error);
        process.exit(1);
      }
    });
}
