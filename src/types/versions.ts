import type { PolicyVersionStatus } from './enums';

// ── Response ──
export interface PolicyVersionSummary {
    id: string;
    groupId: string;
    versionNo: number;
    status: PolicyVersionStatus;
    commitMessage: string | null;
    snapshotHash: string | null;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    createdBy: string | null;
    createdByName: string | null;
    createdAt: string;
    publishedAt: string | null;
}

// ── Request ──
export interface CreateVersionRequest {
    commitMessage?: string;
    effectiveFrom?: string;
    effectiveTo?: string;
}

export interface UpdateVersionRequest {
    commitMessage?: string;
    effectiveFrom?: string;
    effectiveTo?: string;
}