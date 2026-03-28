import { type Command } from 'commander';
import { loadConfig } from '@/lib/config';
import { printJson, printError } from '@/lib/output';

export function registerStatusCommand(program: Command): void {
    program
        .command('status')
        .description('Check LexQ API server status')
        .action(async () => {
            const config = loadConfig();
            const baseUrl = config.baseUrl.replace(/\/v1\/partners\/?$/, '');

            try {
                const start = Date.now();
                const response = await fetch(`${baseUrl}/health`);
                const latency = Date.now() - start;

                printJson({
                    status: response.ok ? 'ok' : 'degraded',
                    httpStatus: response.status,
                    latencyMs: latency,
                    endpoint: `${baseUrl}/health`,
                });
            } catch {
                printError(new Error(`Cannot reach LexQ API at ${baseUrl}/health`));
                process.exit(1);
            }
        });
}