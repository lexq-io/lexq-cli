import type { Role } from './enums.js';

export interface WhoAmIResponse {
    tenantId: string;
    userId: string;
    role: Role;
}