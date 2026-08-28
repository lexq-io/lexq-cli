import { writeFileSync } from 'node:fs';
import { apiRequest, type ApiClientOptions } from '@/lib/api-client';
import { ExportFormat as ExportFormatName } from '@/types/enums';

export type ExportFormat = Lowercase<(typeof ExportFormatName)[number]>;

/**
 * The export formats the server accepts, in a stable order.
 *
 * The server owns this vocabulary and delivers it in the contract manifest. A list
 * written out here would go on passing every check while the server moved on without
 * it, and the hand-written copies had already drifted: the four MCP tools split two
 * and two over which of the two values came first.
 *
 * The manifest carries constant names (`CSV`); the request parameter is the lowercase
 * form, a rule the server enforces.
 *
 * The order is settled here rather than taken from the manifest. Which formats exist
 * is the server's call; the order they are listed in is this package's, and sorting
 * means a third format arrives without anyone having to decide where it goes.
 */
export const EXPORT_FORMATS = ExportFormatName.map((name) => name.toLowerCase()).sort() as [
  ExportFormat,
  ...ExportFormat[],
];

/**
 * Read the `--as` value, rejecting anything that is not an export format.
 *
 * The earlier form fell back to `json` for any unrecognized value, which quietly
 * contradicted the command's own default: `lexq facts export --as CSV` announced csv
 * and delivered json. A typo should not change the file you get.
 */
export function parseFormat(value: unknown): ExportFormat {
  if (typeof value === 'string' && (EXPORT_FORMATS as readonly string[]).includes(value)) {
    return value as ExportFormat;
  }
  throw new Error(
    `Unsupported export format: ${String(value)}. Use ${EXPORT_FORMATS.join(' or ')}.`,
  );
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
