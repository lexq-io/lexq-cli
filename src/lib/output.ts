import Table from 'cli-table3';

export type OutputFormat = 'json' | 'table';

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
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
