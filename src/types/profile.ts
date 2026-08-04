import type { BaselineStatus, ProfileCacheState, ProfilePhase } from './enums';

/** Merged percentile summary. p50/p95/p99 are null when n < 100 (withheld, never fabricated). */
export interface PercentileStats {
  n: number;
  minNanos: number;
  maxNanos: number;
  p50Nanos: number | null;
  p95Nanos: number | null;
  p99Nanos: number | null;
}

export interface GroupSummary {
  cacheState: ProfileCacheState;
  total: PercentileStats;
}

/**
 * Rule-scoped phase. TOTAL never appears here.
 *
 * The engine enforces the shape in ProfileKey: GROUP scope has no ruleId and phase TOTAL,
 * RULE scope has a ruleId and phase CONDITION or ACTION. Group-wide timing is not a phase
 * label at all — it comes back as GroupSummary.total.
 */
export type RuleProfilePhase = Exclude<ProfilePhase, 'TOTAL'>;

export interface BaselineInfo {
  phase: RuleProfilePhase;
  baselineP50Nanos: number | null;
  cohortSize: number;
  status: BaselineStatus;
}

export interface RulePhaseStats {
  phase: RuleProfilePhase;
  stats: PercentileStats;
  baselineMultiple: number | null;
  flagged: boolean;
}

export interface RuleProfile {
  ruleId: string;
  phases: RulePhaseStats[];
}

export interface ProfileOverview {
  policyGroupId: string;
  policyVersionId: string | null;
  from: string;
  to: string;
  ruleCacheState: ProfileCacheState;
  droppedRows: number;
  summary: GroupSummary[];
  baselines: BaselineInfo[];
  rules: RuleProfile[];
}

export interface PhaseCacheDistribution {
  phase: RuleProfilePhase;
  cacheState: ProfileCacheState;
  stats: PercentileStats;
}

/** One 60s window's own row-level values — honest per-window data, not a merge. */
export interface WindowPoint {
  windowStart: string;
  n: number;
  p50Nanos: number;
  p95Nanos: number;
  p99Nanos: number;
}

export interface WindowSeries {
  phase: RuleProfilePhase;
  cacheState: ProfileCacheState;
  points: WindowPoint[];
}

export interface RuleLatencyDetail {
  ruleId: string;
  policyVersionId: string | null;
  from: string;
  to: string;
  droppedRows: number;
  distributions: PhaseCacheDistribution[];
  series: WindowSeries[];
}
