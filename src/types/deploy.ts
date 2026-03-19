import type { DeploymentType, PolicyVersionStatus } from './enums';

// ── Response ──
export interface DeploymentSummary {
    id: string;
    groupId: string;
    groupName: string;
    versionId: string;
    versionNo: number;
    previousVersionId: string | null;
    previousVersionNo: number | null;
    type: DeploymentType;
    memo: string | null;
    deployedBy: string;
    deployedByName: string | null;
    deployedAt: string;
}

export interface DeploymentDetail extends DeploymentSummary {
    snapshotHash: string | null;
    versionStatus: PolicyVersionStatus;
}

export interface DeploymentStatus {
    groupId: string;
    groupName: string;
    currentVersionId: string | null;
    currentVersionNo: number | null;
    isDeployed: boolean;
}