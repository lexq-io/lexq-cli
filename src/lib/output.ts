import Table from 'cli-table3';
import type { UnregisteredFact } from '@/types/api';

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

/** 미등록 fact 경고 — stderr 로(stdout JSON 비오염), 비차단. 복붙용 create 힌트 포함. */
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
