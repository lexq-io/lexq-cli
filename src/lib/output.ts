import Table from 'cli-table3';
import { InvalidArgumentError } from 'commander';
import { stringifyJson } from '@/lib/lossless-json';
import type { UnregisteredFact } from '@/types/api';

/** How a command prints its result. The format of an exported file is `--as`, not this. */
export const OUTPUT_FORMATS = ['json', 'table'] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

/**
 * Read the root `--format` value, rejecting anything that is not an output format.
 *
 * Commands check only for `table` and print JSON otherwise, so without this check
 * `--format csv` and `--format tabel` would print JSON without a word. `csv` is a file
 * format, which the commands that write a file take as `--as`.
 */
export function parseOutputFormat(value: string): OutputFormat {
  if ((OUTPUT_FORMATS as readonly string[]).includes(value)) return value as OutputFormat;
  throw new InvalidArgumentError(
    `Use ${OUTPUT_FORMATS.join(' or ')}. The format of an exported file is chosen with --as.`,
  );
}

/** Every command's JSON output. Long decimals are printed as they came from the engine. */
export function printJson(data: unknown): void {
  console.log(stringifyJson(data, 2));
}

/**
 * Builds the group cell of a history table. Group names only have to be unique among groups
 * that are not deleted, so a deleted group and a newer one can share a name. A deleted group's
 * name gets a `(deleted)` prefix. Cells are truncated at the end, so the prefix stays.
 */
export function groupLabel(
  name: string | null,
  archivedAt: string | null | undefined,
  fallback = '–',
): string {
  const label = name ?? fallback;
  return archivedAt ? `(deleted) ${label}` : label;
}

export function printTable(
  headers: string[],
  rows: string[][],
  options?: { truncate?: number },
): void {
  const table = new Table({
    head: headers,
    style: { head: ['cyan'] },
    wordWrap: true,
  });

  for (const row of rows) {
    if (options?.truncate) {
      table.push(
        row.map((cell) =>
          cell.length > options.truncate! ? cell.substring(0, options.truncate!) + '…' : cell,
        ),
      );
    } else {
      table.push(row);
    }
  }

  console.log(table.toString());
}

export function printError(error: unknown): void {
  if (error instanceof Error && 'errorCode' in error) {
    const apiErr = error as Error & { errorCode: string | null; statusCode: number };
    const output = {
      error: apiErr.errorCode ?? 'UNKNOWN',
      message: apiErr.message,
      status: apiErr.statusCode,
    };
    console.error(JSON.stringify(output, null, 2));
  } else if (error instanceof Error) {
    console.error(JSON.stringify({ error: 'CLI_ERROR', message: error.message }, null, 2));
  } else {
    console.error(JSON.stringify({ error: 'UNKNOWN', message: String(error) }, null, 2));
  }
}

/**
 * Unregistered-fact warning. Goes to stderr so it never pollutes JSON on stdout,
 * and is advisory only. Includes a copy-paste create hint.
 */
export function printUnregisteredFactsWarning(facts: UnregisteredFact[]): void {
  if (facts.length === 0) return;
  const s = facts.length === 1 ? '' : 's';
  console.error(
    `\n⚠ ${facts.length} undefined fact${s} referenced — register to enable validation:`,
  );
  for (const f of facts) {
    const type = f.inferredType ?? f.candidateTypes?.[0] ?? 'STRING';
    const note = f.conflict ? ` (ambiguous: ${f.candidateTypes?.join(' | ') ?? '?'})` : '';
    console.error(`  • ${f.key} → ${type}${note}`);
    console.error(
      `      lexq facts create --key ${f.key} --name "${f.suggestedName}" --type ${type}`,
    );
  }
  console.error('');
}
