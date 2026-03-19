import type { ConflictResolutionMode, ConflictResolutionStrategy } from './enums';

// ── Response ──
export interface PolicyRuleSummary {
    id: string;
    name: string;
    priority: number;
    conditionSummary: string;
    totalConditionCount: number;
    actionSummary: string;
    totalActionCount: number;
    mutexGroup: string | null;
    mutexMode: ConflictResolutionMode;
    mutexStrategy: ConflictResolutionStrategy;
    isEnabled: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface PolicyRuleDetail {
    id: string;
    policyVersionId: string;
    name: string;
    priority: number;
    condition: Record<string, unknown>;
    actions: Record<string, unknown>[];
    mutexGroup: string | null;
    mutexMode: ConflictResolutionMode;
    mutexStrategy: ConflictResolutionStrategy;
    mutexLimit: number | null;
    isEnabled: boolean;
    createdAt: string;
    updatedAt: string;
}

// ── Request ──
export interface ReorderRulesRequest {
    ruleIds: string[];
}

export interface ToggleRuleRequest {
    isEnabled: boolean;
}