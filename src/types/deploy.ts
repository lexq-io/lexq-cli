import type { DeploymentType, PolicyGroupStatus, PolicyVersionStatus } from './enums';

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

  // 배포자
  deployedBy: string;
  deployedByName: string;

  // 스냅샷 무결성
  snapshotHash: string;
  hashValid: boolean;

  // 현재 버전 상태 (삭제되었을 수 있음)
  currentVersionStatus: PolicyVersionStatus | null;

  // 이전 버전 정보 (최초 배포면 null)
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
