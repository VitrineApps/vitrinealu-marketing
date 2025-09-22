// Test setup file
import { jest } from '@jest/globals';

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.BUFFER_ACCESS_TOKEN = 'test-token';
process.env.WEBHOOK_SECRET = 'test-webhook-secret-32-chars-long';
process.env.APP_BASE_URL = 'http://localhost:3000';
process.env.OWNER_EMAIL = 'test@example.com';
process.env.SMTP_HOST = 'smtp.test.com';
process.env.SMTP_USER = 'test';
process.env.SMTP_PASS = 'test';

// Mock fetch globally for Buffer API tests
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

// Mock the config to avoid validation during tests
jest.mock('../src/config.js', () => ({
  config: {
    config: {
      BUFFER_ACCESS_TOKEN: 'test-token',
      WEBHOOK_SECRET: 'test-webhook-secret-32-chars-long',
      APP_BASE_URL: 'http://localhost:3000',
      OWNER_EMAIL: 'test@example.com',
      SMTP_HOST: 'smtp.test.com',
      SMTP_USER: 'test',
      SMTP_PASS: 'test',
      TIMEZONE: 'Europe/London'
    },
    brandConfig: {
      name: 'Test Brand',
      timezone: 'Europe/London'
    },
    webhookConfig: {
      secret: 'test-webhook-secret-32-chars-long',
      allowedOrigins: ['http://localhost:3000']
    },
    getWebhookUrl: (postId: string, action: string) =>
      `http://localhost:3000/webhooks/approval?token=test&postId=${postId}&action=${action}`
  }
}));