import type { FailureAction, FailureStatus, TaskType } from './enums';

// ══════════════════════════════════════════
// Response
// ══════════════════════════════════════════

export interface FailureLogResponse {
  id: string;
  tenantId: string;
  taskType: TaskType;
  refId: string | null;
  refSubId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  payload: Record<string, unknown> | null;
  status: FailureStatus;
  createdAt: string;
  updatedAt: string;
}

// ══════════════════════════════════════════
// Request
// ══════════════════════════════════════════

export interface FailureLogSearchRequest {
  taskType?: TaskType;
  status?: FailureStatus;
  searchKeyword?: string;
  startDate?: string;
  endDate?: string;
}

export interface BulkActionRequest {
  logIds: string[];
  action: FailureAction;
}

// ══════════════════════════════════════════
// Response — Bulk
// ══════════════════════════════════════════

export interface BulkActionResponse {
  processedCount: number;
  totalCount: number;
}
