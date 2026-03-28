import { type Command } from 'commander';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { saveConfig, deleteConfig, loadConfig, getConfigPath } from '@/lib/config';
import { apiRequest } from '@/lib/api-client';
import { printJson, printError } from '@/lib/output';
import type { WhoAmIResponse } from '@/types/auth';

export function registerAuthCommands(program: Command): void {
    const auth = program.command('auth').description('Manage authentication');

    // ── login ──
    auth
        .command('login')
        .description('Authenticate with your LexQ API key')
        .action(async () => {
            try {
                const rl = createInterface({ input: stdin, output: stdout });
                const apiKey = await rl.question('Enter your API Key: ');
                rl.close();

                if (!apiKey.trim()) {
                    console.error('API key cannot be empty.');
                    process.exit(1);
                }

                saveConfig({ apiKey: apiKey.trim() });
                console.log(`✓ API key saved to ${getConfigPath()}`);
                console.log('  Run "lexq auth whoami" to verify.');
            } catch (error) {
                printError(error);
                process.exit(1);
            }
        });

    // ── logout ──
    auth
        .command('logout')
        .description('Remove stored credentials')
        .action(() => {
            deleteConfig();
            console.log('✓ Credentials removed.');
        });

    // ── whoami ──
    auth
        .command('whoami')
        .description('Show current authentication info')
        .action(async () => {
            try {
                const config = loadConfig();
                if (!config.apiKey) {
                    console.error('Not authenticated. Run "lexq auth login" first.');
                    process.exit(1);
                }

                const info = await apiRequest<WhoAmIResponse>(
                    'GET',
                    'whoami',
                    { apiKey: config.apiKey, baseUrl: config.baseUrl }
                );

                const masked = config.apiKey.length > 8
                    ? config.apiKey.substring(0, 4) + '****' + config.apiKey.substring(config.apiKey.length - 4)
                    : '****';

                printJson({
                    ...info,
                    apiKey: masked,
                    baseUrl: config.baseUrl,
                });
            } catch (error) {
                printError(error);
                process.exit(1);
            }
        });
}