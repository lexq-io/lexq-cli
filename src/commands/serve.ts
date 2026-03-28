import { type Command } from 'commander';
import { startMcpServer } from '@/mcp/server';

export function registerServeCommand(program: Command): void {
    program
        .command('serve')
        .description('Start LexQ as a server for AI agent integrations')
        .option('--mcp', 'Start as MCP (Model Context Protocol) server over stdio')
        .action(async (opts) => {
            if (!opts.mcp) {
                console.error(
                    'Error: --mcp flag is required.\n' +
                    'Usage: lexq serve --mcp\n\n' +
                    'Starts a stdio MCP server for Claude Desktop, Claude.ai, Gemini, etc.'
                );
                process.exit(1);
            }

            await startMcpServer();
        });
}