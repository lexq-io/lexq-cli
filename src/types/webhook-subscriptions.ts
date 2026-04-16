import type { PlatformEventType, WebhookPayloadFormat } from './enums';

// ══════════════════════════════════════════
// Response
// ══════════════════════════════════════════

export interface WebhookSubscriptionResponse {
  id: string;
  name: string;
  webhookUrl: string;
  subscribedEvents: PlatformEventType[];
  payloadFormat: WebhookPayloadFormat;
  hasSecret: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ══════════════════════════════════════════
// Request
// ══════════════════════════════════════════

export interface WebhookSubscriptionUpsertRequest {
  id?: string;
  name: string;
  webhookUrl: string;
  subscribedEvents: PlatformEventType[];
  payloadFormat?: WebhookPayloadFormat;
  secret?: string;
  isActive?: boolean;
}

// ══════════════════════════════════════════
// Test Response
// ══════════════════════════════════════════

export interface WebhookSubscriptionTestResponse {
  statusCode: number;
  success: boolean;
  message: string;
}
