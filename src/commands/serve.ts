import { type Command } from 'commander';
import dedent from 'dedent';
import { startMcpServer } from '@/mcp/server';

export function registerServeCommand(program: Command): void {
  program
    .command('serve')
    .description('Start LexQ as a server for AI agent integrations')
    .option('--mcp', 'Start as MCP (Model Context Protocol) server over stdio')
    .addHelpText(
      'after',
      dedent`

        Example:
          $ lexq serve --mcp

          Starts a stdio MCP server that exposes 60 tools for policy management.
          Used by Claude Desktop, Claude.ai, Cursor, and other MCP-compatible clients.

        Claude Desktop config (~/.claude/claude_desktop_config.json):
          {
            "mcpServers": {
              "lexq": {
                "command": "npx",
                "args": ["-y", "@lexq/cli", "serve", "--mcp"]
              }
            }
          }
      `,
    )
    .action(async (opts) => {
      if (!opts.mcp) {
        console.error(
          'Error: --mcp flag is required.\n' +
            'Usage: lexq serve --mcp\n\n' +
            'Starts a stdio MCP server for Claude Desktop, Claude.ai, Gemini, etc.',
        );
        process.exit(1);
      }

      await startMcpServer();
    });
}
