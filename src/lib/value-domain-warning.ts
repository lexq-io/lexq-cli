import { stringifyJson } from '@/lib/lossless-json';
import type { ResponseMeta, ValueDomainMismatchVersion } from '@/types/api';

/**
 * Builds the warning text for meta.valueDomainMismatch, which a fact update returns when its new
 * value domain excludes values that existing rules compare against. Returns null when the
 * response carries none.
 *
 * The CLI and the MCP server print the same text: `lexq facts update` writes it to stderr and the
 * stdio MCP server appends it to the tool result. It is exported from `@lexq/cli/mcp` so a server
 * that hosts these tools can append it too. The ids are included so an agent can go straight to
 * the rule.
 *
 * The advice depends on the version. A draft is checked against the new value domain already: its
 * dry runs reject these values now, and live calls will too once it is published and deployed. A
 * deployed version keeps the fact definitions captured when it was published, so calls to it are
 * unaffected, but a version cloned from it carries the rule. Values are printed as the rule holds
 * them; this text does not judge whether a condition became always true or always false, so it
 * does not say whether to change a value or remove the condition.
 *
 * Group and rule names and condition values are written by users, so they are printed as JSON
 * strings with control characters (C0 and C1), line and paragraph separators, and text-direction
 * controls escaped. They cannot drive the terminal, break the layout with a new line, reorder the
 * text around them, or pass as part of the warning an agent reads.
 */
export function formatValueDomainMismatchWarning(meta: unknown): string | null {
  const mismatch = (meta as ResponseMeta | null | undefined)?.valueDomainMismatch;
  if (!mismatch || !Array.isArray(mismatch.versions) || mismatch.versions.length === 0) return null;

  const n = mismatch.totalRuleCount;
  const subject = n === 1 ? '1 rule compares' : `${n} rules compare`;
  const lines = [
    `⚠ ${subject} ${mismatch.factKey} with values the new value domain does not accept. The update was still saved.`,
  ];
  for (const version of mismatch.versions) {
    lines.push(...versionLines(mismatch.factKey, version));
  }
  return lines.join('\n');
}

function versionLines(factKey: string, version: ValueDomainMismatchVersion): string[] {
  const draft = version.versionStatus === 'DRAFT';
  const lines = [
    `  ${quoted(version.groupName)} v${version.versionNo}, ${draft ? 'draft' : 'deployed'} (groupId ${version.groupId}, versionId ${version.versionId})`,
    draft
      ? '    Dry runs of this draft already reject calls that send these values (P-052), and live calls will too once it is published and deployed. Saving one of these rules again is refused (P-051) until each listed condition is edited or removed; first check whether each one is still needed.'
      : '    Calls to it are checked against the fact definitions captured when it was published, so this change does not affect them. A version cloned from it carries these rules; fix them in the clone before publishing it.',
  ];
  for (const rule of version.rules) {
    const conditions = rule.conditions
      .map(
        (c) =>
          `${factKey} ${c.operator} ${escapeUnsafe(stringifyJson(c.value) ?? String(c.value))}`,
      )
      .join('; ');
    lines.push(`    • ${quoted(rule.ruleName)} (ruleId ${rule.ruleId}): ${conditions}`);
  }
  const hidden = version.ruleCount - version.rules.length;
  if (hidden > 0) {
    lines.push(`    … and ${hidden} more rule${hidden === 1 ? '' : 's'} in this version.`);
  }
  return lines;
}

/** A user-written name as a JSON string literal. */
function quoted(name: string): string {
  return escapeUnsafe(stringifyJson(String(name)) ?? '""');
}

/**
 * Characters JSON.stringify leaves in place that a terminal or a text renderer still acts on: DEL
 * and the C1 controls (U+009B starts a control sequence like ESC [), the line and paragraph
 * separators, and the text-direction marks, embeddings, overrides and isolates.
 */
const UNSAFE = /[\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;

/** Escapes UNSAFE inside JSON text. The result is still the same JSON value. */
function escapeUnsafe(json: string): string {
  return json.replace(UNSAFE, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
