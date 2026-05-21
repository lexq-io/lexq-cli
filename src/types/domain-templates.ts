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
}

/**
 * A sample rule the template will create.
 *
 * `condition` is an arbitrarily nested SINGLE/GROUP tree. The CLI only renders
 * the preview as JSON, so it stays `unknown` rather than carrying a full
 * condition-tree type — narrowing it here would be unused precision.
 */
export interface TemplateRuleSpec {
  name: string;
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
  policyGroup: { name: string; description: string; priority: number };
  policyVersion: { versionNo: number; commitMessage: string };
  rules: TemplateRuleSpec[];
}

export interface DomainTemplatePreviewResponse {
  preview: DomainTemplateSummary;
  plan: ApplyPlan;
}

/** Result of applying a template — IDs of the resources that were created. */
export interface ApplyDomainTemplateResponse {
  policyGroupId: string;
  policyGroupName: string;
  policyVersionId: string;
  factsCreated: number;
  rulesCreated: number;
}
