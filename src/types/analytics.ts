import type {DecisionReasonCode, DecisionStatus, SimulationStatus} from './enums';

// ── Dry Run ──
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

export interface ExecutionTrace {
    traceId: string;
    ruleId: string;
    ruleName: string;
    executedAt: string;
    matched: boolean;
    matchExpression: string;
}

export interface DecisionTrace {
    ruleId: string;
    ruleName: string;
    policyGroupId: string;
    policyVersionId: string;
    status: DecisionStatus;
    reasonCode: DecisionReasonCode;
    reasonDetail: string;
}

// ── Requirements ──
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

// ── Simulation ──
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
    createdAt: string;
    completedAt: string | null;
}

export interface SimulationSummary {
    totalRecords: number;
    matchedRecords: number;
    executionTimeMs: number;
    matchRate: number;
}