// Test setup file
import { jest } from '@jest/globals';
import { createHmac } from 'node:crypto';

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.BUFFER_ACCESS_TOKEN = 'test-token';
process.env.WEBHOOK_SECRET = 'test-webhook-secret-32-chars-long';
process.env.APPROVAL_HMAC_SECRET = 'test-approval-hmac-secret-32-characters';
process.env.APP_BASE_URL = 'http://localhost:3000';
process.env.PUBLIC_BASE_URL = 'http://localhost:3001';
process.env.OWNER_EMAIL = 'test@example.com';
process.env.SMTP_HOST = 'smtp.test.com';
process.env.SMTP_USER = 'test';
process.env.SMTP_PASS = 'test';

// Mock fetch globally for Buffer API tests
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

// Mock the config to avoid validation during tests
jest.mock('../src/config.js', () => {
  const approvalSecret = 'test-approval-hmac-secret-32-characters';
  const webhookSecret = 'test-webhook-secret-32-chars-long';

  const signApprovalPayload = ({ postId, action, assetId, timestamp }: { postId: string; action: string; assetId?: string; timestamp: string; }): string => {
    const payload = [postId, action, assetId ?? '', timestamp].join(':');
    return createHmac('sha256', approvalSecret).update(payload).digest('hex');
  };

  const verifyApprovalPayload = (data: { postId: string; action: string; assetId?: string; timestamp: string; signature: string; maxAgeMs?: number; }): boolean => {
    const expected = signApprovalPayload(data);
    if (expected.length !== data.signature.length) {
      return false;
    }
    const age = Date.now() - Number(data.timestamp);
    if (data.maxAgeMs && age > data.maxAgeMs) {
      return false;
    }
    return expected === data.signature;
  };

  return {
    config: {
      config: {
        BUFFER_ACCESS_TOKEN: 'test-token',
        WEBHOOK_SECRET: webhookSecret,
        APPROVAL_HMAC_SECRET: approvalSecret,
        APP_BASE_URL: 'http://localhost:3000',
        PUBLIC_BASE_URL: 'http://localhost:3001',
        OWNER_EMAIL: 'test@example.com',
        SMTP_HOST: 'smtp.test.com',
        SMTP_USER: 'test',
        SMTP_PASS: 'test',
        TIMEZONE: 'Europe/London',
      },
      brandConfig: {
        name: 'Test Brand',
        timezone: 'Europe/London',
      },
      webhookConfig: {
        secret: webhookSecret,
        allowedOrigins: ['http://localhost:3000'],
      },
      getWebhookUrl: (postId: string, action: string) =>
        'http://localhost:3000/webhooks/approval?token=test&postId=' + postId + '&action=' + action,
      getApprovalLink: (postId: string, action: 'approve' | 'reject', assetId?: string, timestamp?: string) => {
        const ts = timestamp ?? Date.now().toString();
        const signature = signApprovalPayload({ postId, action, assetId, timestamp: ts });
        const params = new URLSearchParams({ postId, ts, signature });
        if (assetId) {
          params.set('assetId', assetId);
        }
        return 'http://localhost:3001/webhooks/' + action + '?' + params.toString();
      },
      signApprovalPayload,
      verifyApprovalPayload,
    },
  };
});
