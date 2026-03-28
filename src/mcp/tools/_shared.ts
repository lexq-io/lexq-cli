import { apiRequest, type ApiClientOptions } from '@/lib/api-client';
import { loadConfig } from '@/lib/config';

export interface McpToolResult {
    [key: string]: unknown;
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
}

export function getMcpClientOptions(): ApiClientOptions {
    const config = loadConfig();
    return {
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
    };
}

export async function callApi<T>(
    method: string,
    path: string,
    opts?: { body?: unknown; params?: Record<string, string> }
): Promise<McpToolResult> {
    try {
        const clientOpts = getMcpClientOptions();
        const data = await apiRequest<T>(method, path, {
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
}

export function paginationParams(
    page?: number,
    size?: number
): Record<string, string> {
    const params: Record<string, string> = {};
    if (page !== undefined) params.page = String(page);
    if (size !== undefined) params.size = String(size);
    return params;
}