import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registerAuthCommands } from './commands/auth.js';
import { registerStatusCommand } from './commands/status.js';
import { registerGroupCommands } from './commands/groups.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getVersion(): string {
    try {
        const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
        return pkg.version;
    } catch {
        return '0.0.0';
    }
}

export function createCli(): Command {
    const program = new Command();

    program
        .name('lexq')
        .description('LexQ CLI — manage policies, simulate rules, and deploy from the terminal.')
        .version(getVersion(), '-V, --version')
        .option('--format <format>', 'Output format: json or table', 'json')
        .option('--api-key <key>', 'Override stored API key')
        .option('--base-url <url>', 'Override API base URL')
        .option('--dry-run', 'Preview the HTTP request without executing')
        .option('--verbose', 'Show request/response details')
        .option('--no-color', 'Disable colored output');

    // Register command groups
    registerAuthCommands(program);
    registerStatusCommand(program);
    registerGroupCommands(program);

    return program;
}