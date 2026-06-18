import type { Confidence, SourceKind, ValueType } from '@/types/enums';

export interface ApiResponse<T = unknown> {
  result: 'SUCCESS' | 'ERROR';
  data: T;
  meta?: ResponseMeta | null;
  errorCode: string | null;
  message: string | null;
}

export interface ResponseMeta {
  unregisteredFacts?: UnregisteredFact[];
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
