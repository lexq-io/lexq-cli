import { type Command } from 'commander';
import { apiRequest } from '@/lib/api-client';
import { printJson, printError } from '@/lib/output';
import type { WhoAmIResponse } from '@/types/auth';

export function registerStatusCommand(program: Command): void {
    program
        .command('status')
        .description('Check API connectivity and authentication')
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
                });
            } catch (error) {
                printError(error);
                process.exit(1);
            }
        });
}