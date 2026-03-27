import type { DecisionReasonCode, DecisionStatus, SimulationStatus } from './enums';
import type { ActionDefinition } from './rules';

// ══════════════════════════════════════════
// Shared Trace Types
// ══════════════════════════════════════════

export interface ExecutionTrace {
    traceId: string;
    ruleId: string;
    ruleName: string;
    executedAt: string;
    matched: boolean;
    matchExpression: string;
    generatedActions: ActionDefinition[];
}

export interface DecisionTrace {
    ruleId: string;
    ruleName: string;
    policyGroupId: string;
    policyVersionId: string;
    status: DecisionStatus;
    reasonCode: DecisionReasonCode;
    reasonDetail: string | null;
}

// ══════════════════════════════════════════
// Dry Run
// ══════════════════════════════════════════

export interface DryRunRequest {
    facts: Record<string, unknown>;
    context?: Record<string, unknown>;
    includeDebugInfo: boolean;
    mockExternalCalls: boolean;
}

export interface DryRunResponse {
    outputVariables: Record<string, unknown>;
    executionTraces: ExecutionTrace[];
    decisionTraces: DecisionTrace[];
    latencyMs: number;
    versionNo: number;
}

// ══════════════════════════════════════════
// Requirements
// ══════════════════════════════════════════

export interface FactRequirementDto {
    key: string;
    type: string | null;
    displayName: string | null;
    description: string | null;
    required: boolean;
    usedBy: string[];
}

export interface RequirementsResponse {
    groupId: string;
    versionId: string;
    versionNo: number;
    requiredFacts: FactRequirementDto[];
    exampleRequest: {
        facts: Record<string, unknown>;
        context: Record<string, unknown>;
    };
}

// ══════════════════════════════════════════
// Simulation
// ══════════════════════════════════════════

export interface SimulationHistoryResponse {
    simulationId: string;
    policyGroupId: string;
    policyGroupName: string;
    policyVersionId: string;
    baselinePolicyVersionId: string | null;
    targetVersionName: string | null;
    baselineVersionName: string | null;
    status: SimulationStatus;
    progress: number;
    totalRecords: number;
    matchRate: number;
    createdAt: string;
    completedAt: string | null;
}

export interface SimulationResponse {
    simulationId: string;
    policyGroupId: string;
    policyGroupName: string;
    status: SimulationStatus;
    progress: number;
    summary: SimulationSummary | null;
    metricSummary: MetricSummary | null;
    policyImpact: PolicyImpact | null;
    ruleStats: RuleStat[] | null;
    createdAt: string;
    completedAt: string | null;
}

export interface SimulationSummary {
    totalRecords: number;
    matchedRecords: number;
    executionTimeMs: number;
    matchRate: number;
}

export interface MetricSummary {
    targetVariable: string;
    aggregationType: string;
    baselineValue: number;
    simulatedValue: number;
    delta: number;
    deltaPercentage: number;
}

export interface PolicyImpact {
    policyVersionId: string;
    comparison: Comparison;
}

export interface Comparison {
    baselineVersionId: string;
    difference: ImpactDifference;
}

export interface ImpactDifference {
    matchedCountDelta: number;
    matchedRateDelta: number;
    metricValueDelta: number;
}

export interface RuleStat {
    ruleId: string;
    ruleName: string;
    matchedCount: number;
    metricValue: number;
}

// ══════════════════════════════════════════
// Dry Run Compare
// ══════════════════════════════════════════

export interface DryRunCompareRequest {
    facts: Record<string, unknown>;
    context?: Record<string, unknown>;
    versionIdA: string;
    versionIdB: string;
    mockExternalCalls: boolean;
}

export interface DryRunCompareResponse {
    resultA: DryRunResponse;
    resultB: DryRunResponse;
    diff: OutputDiff;
}

export interface OutputDiff {
    addedKeys: Record<string, unknown>;
    removedKeys: Record<string, unknown>;
    changedKeys: Record<string, OutputValueChange>;
}

export interface OutputValueChange {
    before: unknown;
    after: unknown;
}