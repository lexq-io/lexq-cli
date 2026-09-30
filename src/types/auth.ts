import type { Role } from './enums';

export interface WhoAmIResponse {
  tenantId: string;
  userId: string;
  role: Role;
  /** IANA zone the server reads every `yyyy-MM-dd` date filter in. `UTC` when the organization has none set. */
  tenantTimezone: string;
}
