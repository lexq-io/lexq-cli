import type {
  DeploymentScheduleStatus,
  DeploymentType,
  PolicyGroupStatus,
  PolicyVersionStatus,
  ScheduleCancelReason,
  ScheduleFailureReason,
} from './enums';

// ══════════════════════════════════════════
// Response — Summary
// ══════════════════════════════════════════

export interface DeploymentSummary {
  id: string;
  policyGroupId: string;
  policyGroupName: string;
  versionId: string;
  versionNo: number | null;
  previousVersionId: string | null;
  deployedBy: string;
  deployedByName: string;
  memo: string | null;
  snapshotHash: string;
  deploymentType: DeploymentType;
  deployedAt: string;
}

// ══════════════════════════════════════════
// Response — Detail
// ══════════════════════════════════════════

export interface DeploymentDetail {
  id: string;
  policyGroupId: string;
  policyGroupName: string;
  versionId: string;
  versionNo: number;
  previousVersionId: string | null;
  deploymentType: DeploymentType;
  memo: string | null;
  deployedAt: string;

  // Who deployed it
  deployedBy: string;
  deployedByName: string;

  // Snapshot integrity
  snapshotHash: string;
  hashValid: boolean;

  // Current status of that version (it may since have been deleted)
  currentVersionStatus: PolicyVersionStatus | null;

  // The version this replaced (null on a first deployment)
  previousVersionNo: number | null;
  previousVersionStatus: PolicyVersionStatus | null;
}

// ══════════════════════════════════════════
// Response — Deployment Status (Overview)
// ══════════════════════════════════════════

export interface DeploymentStatus {
  groupId: string;
  groupName: string;
  priority: number;
  groupStatus: PolicyGroupStatus;

  currentVersionId: string | null;
  currentVersionName: string | null;
  currentVersionEffectiveTo: string | null;

  lastDeploymentType: DeploymentType | null;
  lastDeployedBy: string | null;
  lastDeployedByName: string | null;
  lastDeployedAt: string | null;
}

// ══════════════════════════════════════════
// Request
// ══════════════════════════════════════════

export interface PublishRequest {
  memo: string;
}

export interface DeployRequest {
  versionId: string;
  memo: string;
}

export interface RollbackRequest {
  memo: string;
}

export interface UndeployRequest {
  memo: string;
}

// ══════════════════════════════════════════
// Response — Scheduled Deployment
// ══════════════════════════════════════════

export interface DeploymentSchedule {
  id: string;
  policyGroupId: string;
  policyGroupName: string | null;
  versionId: string;
  versionNo: number | null;
  scheduledFor: string;
  scheduledBy: string;
  scheduledByName: string;
  memo: string | null;
  status: DeploymentScheduleStatus;
  executedAt: string | null;
  executedDeploymentId: string | null;
  canceledAt: string | null;
  canceledByName: string | null;
  canceledReason: ScheduleCancelReason | null;
  failedReason: ScheduleFailureReason | null;
  failureDetail: string | null;
  createdAt: string;
}

// ══════════════════════════════════════════
// Request — Scheduled Deployment
// ══════════════════════════════════════════

export interface ScheduleRequest {
  versionId: string;
  memo: string;
}
