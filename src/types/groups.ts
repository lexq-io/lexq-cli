import type {
  ConflictResolutionMode,
  ConflictResolutionStrategy,
  PolicyGroupStatus,
} from './enums';

// ══════════════════════════════════════════
// Response
// ══════════════════════════════════════════

export interface PolicyGroupSummary {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  activationGroup: string | null;
  currentVersionId: string | null;
  currentVersionName: string | null;
  status: PolicyGroupStatus;
  isAbTestActive: boolean;
  trafficRate: number;
  updatedAt: string;
}

export interface PolicyGroupDetail {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  activationGroup: string | null;
  activationMode: ConflictResolutionMode;
  activationStrategy: ConflictResolutionStrategy;
  executionLimit: number | null;
  currentVersionId: string | null;
  currentVersionName: string | null;
  status: PolicyGroupStatus;
  canRollback: boolean;
  isAbTestActive: boolean;
  testVersionId: string | null;
  testVersionName: string | null;
  trafficRate: number;
  createdAt: string;
  updatedAt: string;
}

// ══════════════════════════════════════════
// Request
// ══════════════════════════════════════════

export interface CreatePolicyGroupRequest {
  name: string;
  description?: string;
  priority: number;
  activationGroup?: string;
  activationMode?: ConflictResolutionMode;
  activationStrategy?: ConflictResolutionStrategy;
  executionLimit?: number;
  status?: PolicyGroupStatus;
}

export interface UpdatePolicyGroupRequest {
  name?: string;
  description?: string;
  priority?: number;
  activationGroup?: string;
  activationMode?: ConflictResolutionMode;
  activationStrategy?: ConflictResolutionStrategy;
  executionLimit?: number;
  status?: PolicyGroupStatus;
}

// ══════════════════════════════════════════
// A/B Test
// ══════════════════════════════════════════

export interface StartAbTestRequest {
  testVersionId: string;
  trafficRate: number;
}

export interface AdjustTrafficRateRequest {
  trafficRate: number;
}
