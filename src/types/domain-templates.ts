import type { ValueDomain } from './facts';

// ══════════════════════════════════════════
// Response
// ══════════════════════════════════════════

/** A single entry from the domain template list (also `preview.preview`). */
export interface DomainTemplateSummary {
  template: string;
  displayName: string;
  description: string;
  factCount: number;
  ruleCount: number;
  isAvailable: boolean;
}

/** A fact definition the template will register. */
export interface TemplateFactSpec {
  key: string;
  displayName: string;
  type: string;
  description: string;
  isRequired: boolean;
  /**
   * Allowed values or range for an input fact. `null` when there is no constraint: facts the
   * rules write, BOOLEAN inputs, and inputs that take any value.
   */
  valueDomain: ValueDomain | null;
}

/**
 * A sample rule the template will create.
 *
 * `condition` is an arbitrarily nested SINGLE/GROUP tree. The CLI only renders
 * the preview as JSON, so it stays `unknown` rather than carrying a full
 * condition-tree type — narrowing it here would be unused precision.
 */
export interface TemplateRuleSpec {
  /** Names the rule within the template. The created rule does not store it. */
  key: string;
  name: string;
  /** Why the rule exists. Shown in the preview only; created rules have no description. */
  description: string;
  priority: number;
  condition: unknown;
  actions: Array<{ type: string; parameters: Record<string, unknown> }>;
  mutexGroup: string | null;
  mutexMode: string;
  mutexStrategy: string;
  mutexLimit: number | null;
}

/** The full provisioning plan returned by preview. */
export interface ApplyPlan {
  template: string;
  facts: TemplateFactSpec[];
  policyGroup: { name: string; description: string };
  policyVersion: { versionNo: number; commitMessage: string };
  rules: TemplateRuleSpec[];
}

/**
 * A key this tenant already has with a different type, or with different allowed values or a
 * different range on an input fact. Apply keeps the existing definition.
 */
export interface FactConflict {
  key: string;
  existingType: string;
  templateType: string;
  existingValueDomain: ValueDomain | null;
  templateValueDomain: ValueDomain | null;
}

export interface DomainTemplatePreviewResponse {
  preview: DomainTemplateSummary;
  /** `null` for a template that cannot be applied yet. */
  plan: ApplyPlan | null;
  factConflicts: FactConflict[];
}

/** Result of applying a template — IDs of the resources that were created. */
export interface ApplyDomainTemplateResponse {
  policyGroupId: string;
  policyGroupName: string;
  policyVersionId: string;
  factsCreated: number;
  rulesCreated: number;
}
