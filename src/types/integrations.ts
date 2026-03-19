import type { IntegrationType } from './enums';

// ── Response ──
export interface IntegrationResponse {
    id: string;
    type: IntegrationType;
    name: string;
    baseUrl: string;
    additionalConfig: Record<string, unknown> | null;
    isActive: boolean;
    hasCredential: boolean;
}

// ── Request ──
export interface IntegrationUpsertRequest {
    id?: string;
    type: IntegrationType;
    name: string;
    baseUrl: string;
    credential?: string;
    additionalConfig?: Record<string, unknown>;
    isActive?: boolean;
}

// ── Config Spec ──
export interface ConfigFieldSpec {
    key: string;
    type: 'STRING' | 'SELECT';
    required: boolean;
    defaultValue: string | null;
    options: string[] | null;
    messageKey: string;
}

export type IntegrationConfigSpecs = Record<string, ConfigFieldSpec[]>;