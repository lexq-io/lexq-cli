import type {
  DecisionReasonCode,
  DecisionStatus,
  SimulationMetricType,
  SimulationStatus,
} from './enums';
import type { ActionDefinition } from './rules';

// ══════════════════════════════════════════
// Shared Trace Types
// ══════════════════════════════════════════

export interface ExecutionTrace {
  tenantId: string;
  policyGroupId: string;
  policyVersionId: string;
  ruleId: string;
  ruleName: string;
  executedAt: string;
  matched: boolean;
  matchExpression: string;
  inputFacts: Record<string, unknown>;
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
}

export interface DryRunResponse {
  inputFacts: Record<string, unknown>;
  mutatedFacts: Record<string, unknown>;
  generatedVariables: Record<string, unknown>;
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

// POST /simulations — 생성 직후 (PENDING, 최소 정보)
export interface SimulationStartResponse {
  simulationId: string;
  status: SimulationStatus;
  progress: number;
  createdAt: string;
}

// GET /simulations/{id} — 상세 조회
export interface SimulationDetailResponse {
  simulationId: string;
  policyGroupId: string;
  policyGroupName: string;
  targetVersionName: string | null;
  baselineVersionName: string | null;
  status: SimulationStatus;
  progress: number;
  summary: SimulationSummary | null;
  metricSummary: MetricSummary | null;
  policyImpact: PolicyImpact | null;
  ruleStats: RuleStat[] | null;
  sampleErrors: SimulationErrorSample[];
  note: string | null;
  createdAt: string;
  completedAt: string | null;
}

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
  errorRecords: number;
  matchRate: number;
  note: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface SimulationSummary {
  totalRecords: number;
  processedRecords: number;
  errorRecords: number;
  matchedRecords: number;
  executionTimeMs: number;
  matchRate: number;
}

export interface MetricSummary {
  targetVariable: string;
  aggregationType: SimulationMetricType;
  baselineValue: number;
  simulatedValue: number;
  delta: number;
  deltaPercentage: number;
}

export interface SimulationErrorSample {
  recordIndex: number;
  errorClass: string;
  errorMessage: string;
  inputFactKeys: string[];
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
}

export interface DryRunCompareResponse {
  resultA: DryRunResponse;
  resultB: DryRunResponse;
  diff: OutputDiff;
}

export interface OutputDiff {
  mutatedDiff: Record<string, OutputValueChange>;
  generatedDiff: Record<string, OutputValueChange>;
}

export interface OutputValueChange {
  before: unknown;
  after: unknown;
}

export interface DatasetUploadResponse {
  path: string;
  filename: string;
  size: number;
  contentType: string;
}
