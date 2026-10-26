import { apiRequestWithMeta, type ApiClientOptions } from '@/lib/api-client';
import { loadConfig } from '@/lib/config';
import { stringifyJson } from '@/lib/lossless-json';
import { formatValueDomainMismatchWarning } from '@/lib/value-domain-warning';
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
 * Where the stdio MCP server sends requests. The environment comes first, then
 * ~/.lexq/config.json. The same variables the test suites use let Inspector, CI and a
 * client's env block target any environment without touching the config file.
 */
export function localApiOptions(): ApiClientOptions {
  const stored = loadConfig();
  return {
    baseUrl: process.env.PARTNER_BASE_URL ?? stored.baseUrl,
    apiKey: process.env.LEXQ_API_KEY ?? stored.apiKey,
  };
}

/**
 * Creates a CallApi bound to the local config file (~/.lexq/config.json).
 * Used by the CLI's stdio MCP server.
 */
export function createCallApiFromConfig(): CallApi {
  return async (method, path, opts) => {
    try {
      // Inline content goes as text/plain, the same as the hosted server sends it. The
      // response is read like any other, so a refused upload comes back as an error.
      let form: FormData | undefined;
      if (opts?.upload) {
        form = new FormData();
        const blob = new Blob([opts.upload.content], { type: 'text/plain' });
        form.append(opts.upload.fieldName, blob, opts.upload.filename);
      }

      const { data, meta } = await apiRequestWithMeta(method, path, {
        ...localApiOptions(),
        body: opts?.body,
        form,
        params: opts?.params,
      });
      const content: Array<{ type: 'text'; text: string }> = [
        { type: 'text', text: stringifyJson(data, 2) ?? '' },
      ];
      const warning = formatUnregisteredFactWarning(meta);
      if (warning) content.push({ type: 'text', text: warning });
      const domainWarning = formatValueDomainMismatchWarning(meta);
      if (domainWarning) content.push({ type: 'text', text: domainWarning });
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
export function formatUnregisteredFactWarning(meta: unknown): string | null {
  const facts = (meta as ResponseMeta | null | undefined)?.unregisteredFacts ?? [];
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
