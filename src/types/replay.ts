export interface DecisionReplayResponse {
  traceId: string;
  decisionChanged: boolean;
  determinism: string;
  effectChanges: unknown[];
  baselineFired: unknown[];
  candidateFired: unknown[];
}

export interface ReplayJobSubmitResponse {
  jobId: string;
  status: string;
}

export interface ReplayJobListItem {
  jobId: string;
  status: string;
  progress: number;
  policyGroupId: string;
  policyGroupName: string | null;
  candidateVersionId: string;
  candidateVersionName: string | null;
  fromDate: string;
  toDate: string;
  totalCount: number;
  processedCount: number;
  errorCount: number;
  changedCount: number;
  capped: boolean;
  createdAt: string;
  completedAt: string | null;
}
