import type {ApiExecutionStatus, ApiExecutionType, DecisionReasonCode, DecisionStatus} from './enums';

// ── Response ──
export interface ExecutionHistorySummary {
    id: string;
    traceId: string;
    policyGroupId: string;
    policyGroupName: string;
    policyVersionId: string;
    policyVersionNo: number | null;
    executionType: ApiExecutionType;
    isMatched: boolean;
    status: ApiExecutionStatus;
    latencyMs: number;
    clientIp: string | null;
    errorCode: string | null;
    createdAt: string;
}

export interface ExecutionHistoryDetail extends ExecutionHistorySummary {
    idempotencyKey: string | null;
    requestFacts: Record<string, unknown>;
    requestFactsHash: string | null;
    resultTraces: ExecutionTrace[];
    decisionTraces: DecisionTrace[];
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

export interface ExecutionStatsResponse {
    totalExecutions: number;
    successCount: number;
    noMatchCount: number;
    failureCount: number;
    successRate: number;
    avgLatencyMs: number;
}