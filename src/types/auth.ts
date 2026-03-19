import type { Role } from './enums';

export interface WhoAmIResponse {
    tenantId: string;
    userId: string;
    role: Role;
}