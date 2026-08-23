import { loadConfig } from './config';
import { parseJson, stringifyJson } from './lossless-json';
import type { ApiResponse, ResponseMeta } from '@/types/api';

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
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type RequestOptions = ApiClientOptions & { body?: unknown; params?: Record<string, string> };

async function doFetch(method: string, path: string, options: RequestOptions): Promise<Response> {
  const config = loadConfig();
  const baseUrl = options.baseUrl ?? config.baseUrl;
  const apiKey = options.apiKey ?? config.apiKey;

  if (!apiKey) {
    throw new ApiError(401, 'AUTH', 'Not authenticated. Run "lexq auth login" first.');
  }

  const url = new URL(path, baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');
  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined && value !== '') url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = { 'X-API-KEY': apiKey, Accept: 'application/json' };
  if (options.body) headers['Content-Type'] = 'application/json';

  if (options.dryRun) {
    const masked =
      apiKey.length > 8
        ? apiKey.substring(0, 4) + '****' + apiKey.substring(apiKey.length - 4)
        : '****';
    console.log(`${method} ${url.toString()}`);
    console.log('Headers:');
    console.log(`  X-API-KEY: ${masked}`);
    console.log(`  Content-Type: application/json`);
    if (options.body) {
      console.log('Body:');
      // What is printed here must be what would be sent.
      console.log(`  ${stringifyJson(options.body, 2) ?? ''}`);
    }
    console.log('\n(Use without --dry-run to execute)');
    process.exit(0);
  }

  if (options.verbose) console.error(`→ ${method} ${url.toString()}`);
  const startTime = Date.now();
  const response = await fetch(url.toString(), {
    method,
    headers,
    body: options.body ? stringifyJson(options.body) : undefined,
  });
  if (options.verbose) {
    console.error(`← ${response.status} ${response.statusText} (${Date.now() - startTime}ms)`);
  }
  return response;
}

function assertOk<T>(response: Response, json: ApiResponse<T>): void {
  if (!response.ok || json.result !== 'SUCCESS') {
    throw new ApiError(
      response.status,
      json.errorCode,
      json.message ?? `Request failed with status ${response.status}`,
    );
  }
}

export async function apiRequest<T>(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { data } = await apiRequestWithMeta<T>(method, path, options);
  return data;
}

export async function apiRequestWithMeta<T>(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<{ data: T; meta: ResponseMeta | null }> {
  const response = await doFetch(method, path, options);

  // Blob responses (export endpoints) — no envelope, no meta.
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('text/csv') || contentType.includes('application/octet-stream')) {
    return { data: response as unknown as T, meta: null };
  }

  // No-content responses (DELETE 204 and friends) — no envelope, no meta.
  if (response.status === 204 || contentType === '') {
    return { data: undefined as T, meta: null };
  }

  // response.json() would round long decimals; every enveloped response passes through here.
  const json = parseJson(await response.text()) as ApiResponse<T>;
  assertOk(response, json);
  return { data: json.data, meta: json.meta ?? null };
}
