import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CallApi } from './_shared';
import { paginationParams } from './_shared';
import { PlatformEventType, WebhookPayloadFormat } from '@/types/enums';

export function registerWebhookSubscriptionTools(server: McpServer, callApi: CallApi): void {
  server.registerTool(
    'lexq_webhook_subscriptions_list',
    {
      title: 'List Webhook Subscriptions',
      description:
        'List platform event webhook subscriptions. These receive deployment lifecycle notifications (publish, deploy, rollback, undeploy).',
      inputSchema: {
        page: z.number().int().min(0).default(0).describe('Page number'),
        size: z.number().int().min(1).max(100).default(20).describe('Page size'),
      },
    },
    async ({ page, size }) => {
      const params = paginationParams(page, size);
      return callApi('GET', 'webhook-subscriptions', { params });
    },
  );

  server.registerTool(
    'lexq_webhook_subscriptions_get',
    {
      title: 'Get Webhook Subscription',
      description: 'Get webhook subscription detail by ID.',
      inputSchema: {
        id: z.string().uuid().describe('Webhook subscription ID'),
      },
    },
    async ({ id }) => callApi('GET', `webhook-subscriptions/${id}`),
  );

  server.registerTool(
    'lexq_webhook_subscriptions_save',
    {
      title: 'Save Webhook Subscription',
      description:
        'Create or update a webhook subscription. Omit id to create, provide id to update. Events: VERSION_PUBLISHED, DEPLOYED, ROLLED_BACK, UNDEPLOYED. Formats: GENERIC (full JSON), SLACK ({"text": "..."}).',
      inputSchema: {
        id: z
          .string()
          .uuid()
          .optional()
          .describe('Subscription ID (omit to create, provide to update)'),
        name: z.string().min(1).describe('Subscription name (unique per tenant)'),
        webhookUrl: z.string().url().describe('Webhook endpoint URL'),
        subscribedEvents: z
          .array(z.enum(PlatformEventType))
          .min(1)
          .describe('Events to subscribe to'),
        payloadFormat: z
          .enum(WebhookPayloadFormat)
          .optional()
          .default('GENERIC')
          .describe('Payload format'),
        secret: z.string().optional().describe('HMAC-SHA256 signing secret'),
        isActive: z
          .boolean()
          .optional()
          .default(true)
          .describe('Whether the subscription is active'),
      },
    },
    async ({ ...body }) => callApi('POST', 'webhook-subscriptions', { body }),
  );

  server.registerTool(
    'lexq_webhook_subscriptions_delete',
    {
      title: 'Delete Webhook Subscription',
      description: 'Delete a webhook subscription by ID.',
      inputSchema: {
        id: z.string().uuid().describe('Webhook subscription ID'),
      },
    },
    async ({ id }) => callApi('DELETE', `webhook-subscriptions/${id}`),
  );

  server.registerTool(
    'lexq_webhook_subscriptions_test',
    {
      title: 'Test Webhook Subscription',
      description:
        'Send a test event to verify webhook connectivity. Returns the HTTP status code and success/failure message.',
      inputSchema: {
        id: z.string().uuid().describe('Webhook subscription ID'),
      },
    },
    async ({ id }) => callApi('POST', `webhook-subscriptions/${id}/test`),
  );
}
