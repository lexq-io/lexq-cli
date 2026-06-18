import { apiRequestWithMeta, type ApiClientOptions } from '@/lib/api-client';
import { loadConfig } from '@/lib/config';
import type { ResponseMeta } from '@/types/api';

export interface McpToolResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Function signature for making API calls.
 * Injected into tool registration functions for testability and reuse.
 *
 * - lexq-cli (stdio): uses createCallApiFromConfig() — reads ~/.lexq/config.json
 * - lexq-mcp (HTTP):  uses createApiCaller(apiKey) — Bearer token from request
 */
export type CallApi = (
  method: string,
  path: string,
  opts?: {
    body?: unknown;
    params?: Record<string, string>;
    upload?: { content: string; filename: string; fieldName: string };
  },
) => Promise<McpToolResult>;

/**
 * Creates a CallApi bound to the local config file (~/.lexq/config.json).
 * Used by the CLI's stdio MCP server.
 */
export function createCallApiFromConfig(): CallApi {
  return async (method, path, opts) => {
    try {
      const config = loadConfig();

      // ── Upload 처리 (multipart/form-data) ──
      if (opts?.upload) {
        const url = new URL(
          path,
          config.baseUrl.endsWith('/') ? config.baseUrl : config.baseUrl + '/',
        );
        if (opts.params) {
          for (const [key, value] of Object.entries(opts.params)) {
            if (value !== undefined) url.searchParams.set(key, value);
          }
        }

        if (!config.apiKey) {
          throw new Error('Not authenticated. Run "lexq auth login" first.');
        }

        const blob = new Blob([opts.upload.content], { type: 'text/plain' });
        const formData = new FormData();
        formData.append(opts.upload.fieldName, blob, opts.upload.filename);

        const response = await fetch(url.toString(), {
          method,
          headers: { 'X-API-KEY': config.apiKey },
          body: formData,
        });

        const data = await response.json();
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }

      const clientOpts: ApiClientOptions = {
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
      };
      const { data, meta } = await apiRequestWithMeta(method, path, {
        ...clientOpts,
        body: opts?.body,
        params: opts?.params,
      });
      const content: Array<{ type: 'text'; text: string }> = [
        { type: 'text', text: JSON.stringify(data, null, 2) },
      ];
      const warning = formatUnregisteredFactWarning(meta);
      if (warning) content.push({ type: 'text', text: warning });
      return { content };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  };
}

export function paginationParams(page?: number, size?: number): Record<string, string> {
  const params: Record<string, string> = {};
  if (page !== undefined) params.page = String(page);
  if (size !== undefined) params.size = String(size);
  return params;
}

/**
 * Builds a salient, actionable warning from a response's meta when it reports facts that
 * rules reference but the schema does not define. Returns null when there is nothing to warn.
 *
 * Shared by both CallApi implementations (CLI stdio here, lexq-mcp HTTP via @lexq/cli/mcp)
 * so the agent-facing text is identical on every surface. The backend only populates
 * meta.unregisteredFacts on rule create/update, so this only ever fires there.
 */
export function formatUnregisteredFactWarning(
  meta: ResponseMeta | null | undefined,
): string | null {
  const facts = meta?.unregisteredFacts ?? [];
  if (facts.length === 0) return null;

  const lines = facts.map((f) => {
    if (f.inferredType) {
      return `  • ${f.key} (${f.inferredType}) — register: lexq_facts_create({ key: "${f.key}", name: "${f.suggestedName}", type: "${f.inferredType}" })`;
    }
    const choices = f.candidateTypes?.join(' | ') ?? 'STRING | NUMBER | BOOLEAN';
    return `  • ${f.key} (ambiguous) — pick a type (${choices}), then lexq_facts_create({ key: "${f.key}", name: "${f.suggestedName}", type: <chosen> })`;
  });

  return [
    `⚠ The saved rule references ${facts.length} fact(s) not defined in the schema. The rule was saved — this does not block — but undefined facts skip type validation and the dry-run requirements analyzer.`,
    ...lines,
    `Register them now so the rule validates as intended, or call lexq_facts_unregistered to review the version's full list.`,
  ].join('\n');
}
