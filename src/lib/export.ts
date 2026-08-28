import { writeFileSync } from 'node:fs';
import { apiRequest, type ApiClientOptions } from '@/lib/api-client';

export type ExportFormat = 'csv' | 'json';

/**
 * Read the `--format` value, rejecting anything that is not an export format.
 *
 * The earlier form fell back to `json` for any unrecognized value, which quietly
 * contradicted the command's own default: `lexq facts export --as CSV` announced csv
 * and delivered json. A typo should not change the file you get.
 */
export function parseFormat(value: unknown): ExportFormat {
  if (value === 'csv' || value === 'json') return value;
  throw new Error(`Unsupported export format: ${String(value)}. Use csv or json.`);
}

/**
 * Fetch an export and either write it to a file or print it.
 *
 * Export endpoints return a file, not the usual `{ result, data }` envelope, so the body
 * arrives here as text and is written through byte for byte. Passing it through a
 * serializer would drop the byte-order mark that spreadsheets rely on to read CSV as
 * UTF-8, and would wrap JSON in a second layer of quoting.
 */
export async function runExport(
  path: string,
  format: ExportFormat,
  options: ApiClientOptions & { params?: Record<string, string>; output?: string },
): Promise<void> {
  const { output, params, ...clientOptions } = options;

  const body = await apiRequest<string>('GET', path, {
    ...clientOptions,
    params: { ...params, format },
  });

  // A non-string body means the response was not recognized as a file. Writing it would
  // silently produce `{}`, which is what this command did before the transport learned to
  // read the body.
  if (typeof body !== 'string') {
    throw new Error(
      `Export did not return a file (${path}). Re-run with --verbose to see the response headers.`,
    );
  }

  if (output) {
    writeFileSync(output, body, 'utf-8');
    console.log(`✓ Exported to ${output}`);
    return;
  }

  process.stdout.write(body.endsWith('\n') ? body : body + '\n');
}
