import type { PolicyVersionStatus } from './enums';
import type { ConditionNode, ActionDefinition } from './rules';
import type { ConflictResolutionMode, ConflictResolutionStrategy } from './enums';

// ══════════════════════════════════════════
// Compiled Rule (스냅샷 내 룰)
// ══════════════════════════════════════════

export interface CompiledRule {
  ruleId: string;
  name: string;
  priority: number;
  createdAt: string;
  condition: ConditionNode;
  actions: ActionDefinition[];
  mutexGroup: string | null;
  mutexMode: ConflictResolutionMode;
  mutexStrategy: ConflictResolutionStrategy;
  mutexLimit: number | null;
}

// ══════════════════════════════════════════
// Response
// ══════════════════════════════════════════

export interface PolicyVersionSummary {
  id: string;
  groupId: string;
  versionNo: number;
  status: PolicyVersionStatus;
  commitMessage: string | null;
  snapshotHash: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  publishedAt: string | null;
}

export interface PolicyVersionDetail extends PolicyVersionSummary {
  rulesSnapshot: CompiledRule[];
}

// ══════════════════════════════════════════
// Request
// ══════════════════════════════════════════

export interface CreateVersionRequest {
  commitMessage?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
}

export interface UpdateVersionRequest {
  commitMessage?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
}
