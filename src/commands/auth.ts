import { type Command } from 'commander';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import dedent from 'dedent';
import { saveConfig, deleteConfig, loadConfig, getConfigPath } from '@/lib/config';
import { apiRequest } from '@/lib/api-client';
import { printJson, printError } from '@/lib/output';
import type { WhoAmIResponse } from '@/types/auth';

export function registerAuthCommands(program: Command): void {
  const auth = program
    .command('auth')
    .description('Manage authentication')
    .addHelpText(
      'after',
      dedent`

        Commands:
          login     Save your API key locally
          logout    Remove stored credentials
          whoami    Verify authentication and show account info

        Getting Started:
          1. Get your API key from the LexQ Console (Settings → API Keys)
          2. Run: lexq auth login
          3. Verify: lexq auth whoami
      `,
    );

  // ── login ──
  auth
    .command('login')
    .description('Authenticate with your LexQ API key')
    .addHelpText(
      'after',
      dedent`

        Example:
          $ lexq auth login
          Enter your API Key: sk_live_****

          ✓ API key saved to ~/.lexq/config.json
      `,
    )
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
    .addHelpText(
      'after',
      dedent`

        Example:
          $ lexq auth whoami
          { "tenantId": "abc-123", "userId": "...", "role": "ADMIN", "apiKey": "sk_live_****abcd" }
      `,
    )
    .action(async () => {
      try {
        const config = loadConfig();
        if (!config.apiKey) {
          console.error('Not authenticated. Run "lexq auth login" first.');
          process.exit(1);
        }

        const info = await apiRequest<WhoAmIResponse>('GET', 'whoami', {
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
        });

        const masked =
          config.apiKey.length > 8
            ? config.apiKey.substring(0, 4) +
              '****' +
              config.apiKey.substring(config.apiKey.length - 4)
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
