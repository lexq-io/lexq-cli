import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerStatusTools } from './tools/status';
import { registerGroupTools } from './tools/groups';
import { registerVersionTools } from './tools/versions';
import { registerRuleTools } from './tools/rules';
import { registerFactTools } from './tools/facts';
import { registerDeployTools } from './tools/deploy';
import { registerAnalyticsTools } from './tools/analytics';
import { registerHistoryTools } from './tools/history';
import { registerIntegrationTools } from './tools/integrations';
import { registerLogTools } from './tools/logs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getVersion(): string {
    try {
        const pkg = JSON.parse(
            readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')
        );
        return pkg.version as string;
    } catch {
        return '0.1.0';
    }
}

export async function startMcpServer(): Promise<void> {
    const server = new McpServer({
        name: 'lexq',
        version: getVersion(),
    });

    // Register all tool domains (53 tools total)
    registerStatusTools(server);
    registerGroupTools(server);
    registerVersionTools(server);
    registerRuleTools(server);
    registerFactTools(server);
    registerDeployTools(server);
    registerAnalyticsTools(server);
    registerHistoryTools(server);
    registerIntegrationTools(server);
    registerLogTools(server);

    // Connect via stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
}