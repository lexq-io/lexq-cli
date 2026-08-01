import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallApi } from './tools/_shared';

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

// Re-exports for external consumers (lexq-mcp)
export type { CallApi, McpToolResult } from './tools/_shared';
export { paginationParams, formatUnregisteredFactWarning } from './tools/_shared';
export { ApiError } from '@/lib/api-client';
