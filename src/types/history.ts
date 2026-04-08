import type { ApiExecutionStatus, ApiExecutionType } from './enums';
import type { ExecutionTrace, DecisionTrace } from './analytics';

// ══════════════════════════════════════════
// Response — Summary
// ══════════════════════════════════════════

export interface ExecutionHistorySummary {
  id: string;
  traceId: string;
  policyGroupId: string;
  policyGroupName: string | null;
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

// ══════════════════════════════════════════
// Response — Detail
// ══════════════════════════════════════════

export interface ExecutionHistoryDetail extends ExecutionHistorySummary {
  idempotencyKey: string | null;
  requestFacts: Record<string, unknown>;
  requestFactsHash: string | null;
  resultTraces: ExecutionTrace[];
  decisionTraces: DecisionTrace[];
}

// ══════════════════════════════════════════
// Response — Stats
// ══════════════════════════════════════════

export interface ExecutionStatsResponse {
  totalExecutions: number;
  successCount: number;
  noMatchCount: number;
  failureCount: number;
  successRate: number;
  avgLatencyMs: number;
}
