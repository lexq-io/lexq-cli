import type { Implementation, McpServer } from '@modelcontextprotocol/server';
import type { CallApi } from './tools/_shared';
import serverInfo from './server-info.json';

import { registerStatusTools } from './tools/status';
import { registerGroupTools } from './tools/groups';
import { registerVersionTools } from './tools/versions';
import { registerRuleTools } from './tools/rules';
import { registerFactTools } from './tools/facts';
import { registerDeployTools } from './tools/deploy';
import { registerAnalyticsTools } from './tools/analytics';
import { registerProfileTools } from './tools/profile';
import { registerReplayTools } from './tools/replay';
import { registerHistoryTools } from './tools/history';
import { registerProvenanceTools } from './tools/provenance';
import { registerLogTools } from './tools/logs';
import { registerWebhookSubscriptionTools } from './tools/webhook-subscriptions';
import { registerDomainTemplateTools } from './tools/domain-templates';

/**
 * Registers all MCP tools on the given server.
 *
 * @param server - McpServer instance
 * @param callApi - API caller function (config-based for CLI, Bearer-based for HTTP)
 */
export function registerAllTools(server: McpServer, callApi: CallApi): void {
  registerStatusTools(server, callApi);
  registerGroupTools(server, callApi);
  registerVersionTools(server, callApi);
  registerRuleTools(server, callApi);
  registerFactTools(server, callApi);
  registerDeployTools(server, callApi);
  registerAnalyticsTools(server, callApi);
  registerProfileTools(server, callApi);
  registerReplayTools(server, callApi);
  registerHistoryTools(server, callApi);
  registerProvenanceTools(server, callApi);
  registerLogTools(server, callApi);
  registerDomainTemplateTools(server, callApi);
  registerWebhookSubscriptionTools(server, callApi);
}

/**
 * How the server introduces itself when a client connects: a title, a description and an
 * icon the client can show, and a link to its website. A host serving these tools adds its
 * own version.
 *
 * The values are kept in server-info.json rather than here because server.json lists them
 * again for the MCP Registry, and `pnpm registry:check` has to read both without a build.
 */
export const SERVER_INFO: Omit<Implementation, 'version'> = { name: 'lexq', ...serverInfo };

// Re-exports for external consumers (lexq-mcp)
export type { CallApi, McpToolResult } from './tools/_shared';
export { paginationParams, formatUnregisteredFactWarning } from './tools/_shared';
export { formatValueDomainMismatchWarning } from '@/lib/value-domain-warning';
export { ApiError } from '@/lib/api-client';

/**
 * JSON helpers that preserve long decimals. Exported so a host embedding these tools
 * serializes tool arguments and results the same way the CLI does.
 */
export { parseJson, stringifyJson, isLosslessNumber, LosslessNumber } from '@/lib/lossless-json';
