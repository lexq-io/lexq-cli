import type {
  DecisionReasonCode,
  DecisionStatus,
  SimulationMetricType,
  SimulationStatus,
} from './enums';
import type { ActionDefinition } from './rules';
import type { LosslessNumber } from '@/lib/lossless-json';

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

// POST /simulations — just created (PENDING, minimal fields)
export interface SimulationStartResponse {
  simulationId: string;
  status: SimulationStatus;
  progress: number;
  createdAt: string;
}

// GET /simulations/{id} — full detail
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

/**
 * Aggregated metric values for one simulation.
 *
 * `baselineValue`, `simulatedValue` and `delta` are exact decimals. An average over a
 * repeating fraction, for one, carries more significant digits than an IEEE-754 double holds,
 * and reading the response preserves such a literal as a `LosslessNumber` rather than rounding
 * it. Render these three with `String()` or a template literal. A preserved number has no
 * `toFixed()`, and arithmetic on it silently rounds or throws.
 *
 * `toLocaleString()` is not interchangeable here. It is exact on a preserved number but rounds
 * a plain one to three decimal places, so mixing the two makes the printed precision depend on
 * how long the value happens to be.
 *
 * `deltaPercentage` is a ratio the engine reports as a floating-point value, so it is always a
 * plain `number`.
 */
export interface MetricSummary {
  targetVariable: string;
  aggregationType: SimulationMetricType;
  baselineValue: number | LosslessNumber;
  simulatedValue: number | LosslessNumber;
  delta: number | LosslessNumber;
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
  /** An exact decimal, with the same handling as {@link MetricSummary}'s values. */
  metricValueDelta: number | LosslessNumber;
}

export interface RuleStat {
  ruleId: string;
  ruleName: string;
  matchedCount: number;
  /** An exact decimal, with the same handling as {@link MetricSummary}'s values. */
  metricValue: number | LosslessNumber;
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
