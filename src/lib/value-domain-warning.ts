import { stringifyJson } from '@/lib/lossless-json';
import type { ResponseMeta, ValueDomainMismatchVersion } from '@/types/api';

/**
 * Builds the warning text for meta.valueDomainMismatch, which a fact update returns when its new
 * value constraint excludes values that existing rules compare against. Returns null when the
 * response carries none.
 *
 * The CLI and the MCP server print the same text: `lexq facts update` writes it to stderr and the
 * stdio MCP server appends it to the tool result. It is exported from `@lexq/cli/mcp` so a server
 * that hosts these tools can append it too. The ids are included so an agent can go straight to
 * the rule.
 *
 * The advice depends on the version. A draft picks up the new constraint when it is published.
 * A deployed version keeps the fact definitions captured when it was published, so live calls are
 * unchanged, but a version cloned from it carries the rule. Values are printed as the rule holds
 * them; this text does not judge whether a condition became always true or always false.
 *
 * Group and rule names are written by users, so they are printed as JSON strings: quoted, with
 * control characters escaped. A name cannot emit terminal escape sequences, break the layout
 * with a newline, or pass as part of the warning an agent reads.
 */
export function formatValueDomainMismatchWarning(meta: unknown): string | null {
  const mismatch = (meta as ResponseMeta | null | undefined)?.valueDomainMismatch;
  if (!mismatch || mismatch.versions.length === 0) return null;

  const n = mismatch.totalRuleCount;
  const subject = n === 1 ? '1 rule compares' : `${n} rules compare`;
  const lines = [
    `⚠ ${subject} ${mismatch.factKey} with values the new constraint does not accept. The update was still saved.`,
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
      ? '    Once published, it rejects calls that send these values (P-052), so these conditions no longer work as written. Saving one of these rules again requires a value the constraint accepts (P-051).'
      : '    It keeps running on the fact definitions captured when it was published, so live calls are unchanged. A version cloned from it carries these rules; fix them in the clone before publishing it.',
  ];
  for (const rule of version.rules) {
    const conditions = rule.conditions
      .map((c) => `${factKey} ${c.operator} ${stringifyJson(c.value) ?? String(c.value)}`)
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
  return stringifyJson(String(name)) ?? '""';
}
