import { vi } from 'vitest';

// Mock environment variables for tests
vi.mock('../../config.js', () => ({
  env: {
    ENHANCE_SERVICE_URL: 'http://localhost:8000',
    GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      type: 'service_account',
      project_id: 'test-project',
      private_key_id: 'test-key-id',
      private_key: '-----BEGIN PRIVATE KEY-----\nTESTKEY\n-----END PRIVATE KEY-----',
      client_email: 'test@test-project.iam.gserviceaccount.com',
      client_id: '123456789',
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
    }),
    OPENAI_API_KEY: 'test-openai-key',
    BUFFER_ACCESS_TOKEN: 'test-buffer-token',
    SMTP_URL: 'smtp://test@example.com:password@smtp.example.com:587',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
    RUNWAY_API_KEY: 'test-runway-key',
  },
}));

// Mock shared env loading
vi.mock('@vitrinealu/shared/env', () => ({
  loadEnv: () => ({
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
  }),
}));