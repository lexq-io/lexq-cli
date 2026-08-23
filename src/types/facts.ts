import type { ValueType } from './enums';

// ══════════════════════════════════════════
// Key grammar
// ══════════════════════════════════════════

/**
 * A fact key starts with a letter, then letters, numbers, and underscores.
 *
 * **Casing is not enforced.** `paymentAmount`, `payment_amount`, `PaymentAmount`, and
 * `PAYMENT_AMOUNT` are all valid keys. These docs and examples use camelCase, but the key
 * belongs to whoever writes it, and keys are case-sensitive.
 *
 * What the grammar does reject: a leading underscore (that namespace holds engine-injected
 * keys), a `__delta` suffix (that names an engine-generated variable), characters that cannot
 * appear in a condition's left-hand side, and a leading digit.
 *
 * Keep this in step with the server. Through 0.1.50 this pattern was narrower than the
 * server's, so the CLI rejected keys the API accepts. `tests/fact-key.mjs` guards it.
 */
export const FACT_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;

// ══════════════════════════════════════════
// Response
// ══════════════════════════════════════════

export interface FactSchemaResponse {
  id: string;
  key: string;
  name: string;
  type: ValueType;
  description: string | null;
  isSystem: boolean;
  isRequired: boolean;
  isPii: boolean;
}

// ══════════════════════════════════════════
// Request
// ══════════════════════════════════════════

export interface CreateFactRequest {
  key: string;
  name: string;
  type: ValueType;
  description?: string;
  isRequired: boolean;
  isPii: boolean;
}

export interface UpdateFactRequest {
  name?: string;
  description?: string;
  isRequired?: boolean;
  isPii?: boolean;
}
