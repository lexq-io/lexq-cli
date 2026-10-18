import type {
  ConditionOperator,
  Confidence,
  PolicyVersionStatus,
  SourceKind,
  ValueType,
} from '@/types/enums';

export interface ApiResponse<T = unknown> {
  result: 'SUCCESS' | 'ERROR';
  data: T;
  meta?: ResponseMeta | null;
  errorCode: string | null;
  message: string | null;
}

export interface ResponseMeta {
  unregisteredFacts?: UnregisteredFact[];
  valueDomainMismatch?: ValueDomainMismatch;
}

/**
 * Rules whose conditions compare a fact with values its new value domain no longer accepts.
 * A fact update that changed the value domain returns this; when no rule is affected, the key is
 * absent. The update itself is never blocked.
 */
export interface ValueDomainMismatch {
  factKey: string;
  /** Affected rules across all listed versions, including those left out of each `rules` list. */
  totalRuleCount: number;
  versions: ValueDomainMismatchVersion[];
}

export interface ValueDomainMismatchVersion {
  groupId: string;
  groupName: string;
  versionId: string;
  versionNo: number;
  /** DRAFT, or ACTIVE for a version that is currently deployed. Other versions are not listed. */
  versionStatus: PolicyVersionStatus;
  /** Affected rules in this version. `rules` holds only the first few. */
  ruleCount: number;
  rules: ValueDomainMismatchRule[];
}

export interface ValueDomainMismatchRule {
  ruleId: string;
  ruleName: string;
  conditions: Array<{
    operator: ConditionOperator;
    /** As written in the rule. A list operator carries the whole list. */
    value: unknown;
  }>;
}

export interface UnregisteredFact {
  key: string;
  inferredType: ValueType | null;
  confidence: Confidence;
  conflict: boolean;
  candidateTypes: ValueType[] | null;
  suggestedName: string;
  sources: UnregisteredFactSource[];
}

export interface UnregisteredFactSource {
  kind: SourceKind;
  field: string;
  operator?: string;
}

export interface PageResponse<T> {
  content: T[];
  pageNo: number;
  pageSize: number;
  totalElements: number;
  totalPages: number;
  last: boolean;
}
