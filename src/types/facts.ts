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

/**
 * Which values a fact accepts. Every field is optional; omitting all three means no constraint.
 *
 * - `STRING` / `LIST_STRING` — `allowedValues` only
 * - `NUMBER` / `LIST_NUMBER` — `allowedValues`, `min`, `max`
 * - `BOOLEAN` — not applicable (only two values exist)
 *
 * For list types the constraint applies to each element, not to the list as a whole.
 *
 * Numbers may arrive as `LosslessNumber` when a literal does not survive a double round trip.
 * Render them with `String(value)`; `'' + value` folds the digits.
 */
export interface ValueDomain {
  /** Accepted values. When present and non-empty, a value must be one of these. */
  allowedValues?: unknown[];
  /** Lower bound, inclusive. Numeric types only. */
  min?: unknown;
  /** Upper bound, inclusive. Numeric types only. */
  max?: unknown;
}

export interface FactSchemaResponse {
  id: string;
  key: string;
  name: string;
  type: ValueType;
  description: string | null;
  isSystem: boolean;
  isRequired: boolean;
  isPii: boolean;
  /** `null` when no constraint is declared. */
  valueDomain: ValueDomain | null;
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
  /** Omit for no constraint. */
  valueDomain?: ValueDomain;
}

export interface UpdateFactRequest {
  name?: string;
  description?: string;
  /** Omit to leave unchanged. Changing it fails while any rule references the fact. */
  type?: ValueType;
  isRequired?: boolean;
  isPii?: boolean;
  /**
   * Three states, not two. Omitting the field leaves the constraint alone; sending an empty
   * object (`{}`) removes it; sending a populated object replaces it.
   */
  valueDomain?: ValueDomain;
}
