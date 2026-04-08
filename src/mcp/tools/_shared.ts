import { apiRequest, type ApiClientOptions } from '@/lib/api-client';
import { loadConfig } from '@/lib/config';

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
      const data = await apiRequest(method, path, {
        ...clientOpts,
        body: opts?.body,
        params: opts?.params,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      };
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
