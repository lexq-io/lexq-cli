import {
  LosslessNumber,
  isSafeNumber,
  parse as losslessParse,
  stringify as losslessStringify,
} from 'lossless-json';

/**
 * JSON reading and writing that preserves numbers the engine can represent but JavaScript
 * cannot.
 *
 * The LexQ engine stores policy numbers as arbitrary-precision decimals — rule condition
 * values, action parameters, and the facts you send to the execution API. `JSON.parse` and
 * `Number()` round those to an IEEE-754 double, which holds about 17 significant digits. A
 * 34-digit rule value written through this CLI would come back shortened, with no error.
 *
 * So every JSON hop in this package uses {@link parseJson} and {@link stringifyJson} instead:
 * HTTP request and response bodies, `--json` and `--file` inputs, stdout, and MCP tool text.
 *
 * ## What you get back
 *
 * A number keeps its plain `number` type when reading it as a double and writing it back
 * produces the same value — which is true of almost everything, including every number the
 * engine reports as a floating-point value. Only literals that genuinely cannot survive a
 * double come back as a `LosslessNumber`, which holds the original text.
 *
 * A `LosslessNumber` is not a `number`. `String(x)`, template literals and `Array.join` give
 * you the exact digits, but arithmetic silently rounds and `x.toFixed()` does not exist. Treat
 * these values as opaque and pass them through.
 */
const survivesDoubleRoundTrip = (literal: string): boolean => isSafeNumber(literal);

const parseNumber = (value: string): number | LosslessNumber =>
  survivesDoubleRoundTrip(value) ? parseFloat(value) : new LosslessNumber(value);

/** Parses JSON text without rounding numbers that a double cannot hold. */
export const parseJson = (text: string): unknown => losslessParse(text, undefined, parseNumber);

/**
 * Serializes to JSON, writing preserved numbers back as plain number literals.
 *
 * Use this rather than `JSON.stringify` anywhere a value may have come from {@link parseJson}.
 * The native one turns a preserved number into an object, which breaks both the wire format and
 * `lexq ... --json | jq`.
 */
export const stringifyJson = (value: unknown, space?: number | string): string | undefined =>
  losslessStringify(value, undefined, space);

/** Type guard for a preserved number. Check this before any generic object branch. */
export const isLosslessNumber = (value: unknown): value is LosslessNumber =>
  value instanceof LosslessNumber;

export { LosslessNumber };
