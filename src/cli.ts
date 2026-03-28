import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registerAuthCommands } from './commands/auth';
import { registerStatusCommand } from './commands/status';
import { registerGroupCommands } from './commands/groups';
import { registerVersionCommands } from './commands/versions';
import { registerRuleCommands } from './commands/rules';
import { registerFactCommands } from './commands/facts';
import { registerDeployCommands } from './commands/deploy';
import { registerAnalyticsCommands } from './commands/analytics';
import { registerHistoryCommands } from './commands/history';
import { registerIntegrationCommands } from './commands/integrations';
import { registerLogCommands } from './commands/logs';
import {registerServeCommand} from './commands/serve';

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

    // M1: Auth & Infrastructure
    registerAuthCommands(program);
    registerStatusCommand(program);

    // M1+: Policy Groups (CRUD + A/B Test)
    registerGroupCommands(program);

    // M2: Versions, Rules, Facts
    registerVersionCommands(program);
    registerRuleCommands(program);
    registerFactCommands(program);

    // M3: Deployment & Analytics
    registerDeployCommands(program);
    registerAnalyticsCommands(program);

    // M3+: Execution History, Integrations, Failure Logs
    registerHistoryCommands(program);
    registerIntegrationCommands(program);
    registerLogCommands(program);

    // // M7: MCP Server
    registerServeCommand(program);

    return program;
}