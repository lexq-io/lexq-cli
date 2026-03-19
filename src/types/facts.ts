import type { ValueType } from './enums';

// ── Response ──
export interface FactSchemaResponse {
    id: string;
    key: string;
    name: string;
    type: ValueType;
    description: string | null;
    isSystem: boolean;
    isRequired: boolean;
}

// ── Request ──
export interface CreateFactRequest {
    key: string;
    name: string;
    type: ValueType;
    description?: string;
    isRequired: boolean;
}

export interface UpdateFactRequest {
    name: string;
    description?: string;
    isRequired: boolean;
}