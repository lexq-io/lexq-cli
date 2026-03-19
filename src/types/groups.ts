import type { ConflictResolutionMode, ConflictResolutionStrategy, PolicyGroupStatus } from './enums.js';

// ── Response ──
export interface PolicyGroupSummary {
    id: string;
    name: string;
    description: string | null;
    status: PolicyGroupStatus;
    priority: number;
    activationMode: string;
    liveVersionNo: number | null;
    createdAt: string;
    updatedAt: string;
}

export interface PolicyGroupDetail extends PolicyGroupSummary {
    mutexMode: ConflictResolutionMode;
    mutexStrategy: ConflictResolutionStrategy;
    activationGroup: string | null;
    maxSelection: number | null;
    isAbTestActive: boolean;
    currentVersionId: string | null;
    testVersionId: string | null;
    trafficRate: number | null;
}

// ── Request ──
export interface CreatePolicyGroupRequest {
    name: string;
    description?: string;
    priority?: number;
}

export interface UpdatePolicyGroupRequest {
    name?: string;
    description?: string;
    priority?: number;
    status?: PolicyGroupStatus;
}

export interface StartAbTestRequest {
    challengerVersionId: string;
    trafficRate: number;
}

export interface AdjustTrafficRateRequest {
    trafficRate: number;
}