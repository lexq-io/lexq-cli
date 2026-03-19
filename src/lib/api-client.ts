import { loadConfig } from './config.js';
import type {ApiResponse} from "@/types/api";

export interface ApiClientOptions {
    apiKey?: string;
    baseUrl?: string;
    dryRun?: boolean;
    verbose?: boolean;
}

export class ApiError extends Error {
    constructor(
        public readonly statusCode: number,
        public readonly errorCode: string | null,
        message: string
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

export async function apiRequest<T>(
    method: string,
    path: string,
    options: ApiClientOptions & { body?: unknown; params?: Record<string, string> } = {}
): Promise<T> {
    const config = loadConfig();
    const baseUrl = options.baseUrl ?? config.baseUrl;
    const apiKey = options.apiKey ?? config.apiKey;

    if (!apiKey) {
        throw new ApiError(401, 'AUTH', 'Not authenticated. Run "lexq auth login" first.');
    }

    // Build URL with query params
    const url = new URL(path, baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');
    if (options.params) {
        for (const [key, value] of Object.entries(options.params)) {
            if (value !== undefined && value !== '') {
                url.searchParams.set(key, value);
            }
        }
    }

    const headers: Record<string, string> = {
        'X-API-KEY': apiKey,
        'Accept': 'application/json',
    };

    if (options.body) {
        headers['Content-Type'] = 'application/json';
    }

    // Dry-run: print request and exit
    if (options.dryRun) {
        const masked = apiKey.length > 8
            ? apiKey.substring(0, 4) + '****' + apiKey.substring(apiKey.length - 4)
            : '****';

        console.log(`${method} ${url.toString()}`);
        console.log('Headers:');
        console.log(`  X-API-KEY: ${masked}`);
        console.log(`  Content-Type: application/json`);
        if (options.body) {
            console.log('Body:');
            console.log(`  ${JSON.stringify(options.body, null, 2)}`);
        }
        console.log('\n(Use without --dry-run to execute)');
        process.exit(0);
    }

    if (options.verbose) {
        console.error(`→ ${method} ${url.toString()}`);
    }

    const startTime = Date.now();

    const response = await fetch(url.toString(), {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (options.verbose) {
        console.error(`← ${response.status} ${response.statusText} (${Date.now() - startTime}ms)`);
    }

    // Handle blob responses (export endpoints)
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('text/csv') || contentType.includes('application/octet-stream')) {
        return response as unknown as T;
    }

    const json = (await response.json()) as ApiResponse<T>;

    if (!response.ok || json.result !== 'SUCCESS') {
        throw new ApiError(
            response.status,
            json.errorCode,
            json.message ?? `Request failed with status ${response.status}`
        );
    }

    return json.data;
}