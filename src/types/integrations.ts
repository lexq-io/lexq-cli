import type { IntegrationType } from './enums';

// ══════════════════════════════════════════
// Response
// ══════════════════════════════════════════

export interface IntegrationResponse {
    id: string;
    type: IntegrationType;
    name: string;
    baseUrl: string;
    additionalConfig: Record<string, unknown> | null;
    isActive: boolean;
    hasCredential: boolean;
}

// ══════════════════════════════════════════
// Request
// ══════════════════════════════════════════

export interface IntegrationUpsertRequest {
    id?: string;
    type: IntegrationType;
    name: string;
    baseUrl: string;
    credential?: string;
    additionalConfig?: Record<string, unknown>;
    isActive?: boolean;
}

// ══════════════════════════════════════════
// Config Spec (IntegrationConfigMetadata.ConfigFieldSpec)
// ⚠️ Java 원본 클래스 미확인 — messageKey vs label/description 차이 존재 가능
// ══════════════════════════════════════════

export interface ConfigFieldSpec {
    key: string;
    type: 'STRING' | 'SELECT';
    required: boolean;
    defaultValue: string | null;
    options: string[] | null;
    messageKey: string;
}

export type IntegrationConfigSpecs = Record<string, ConfigFieldSpec[]>;