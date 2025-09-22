import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadEnv, resetEnvCacheForTesting } from '../env.js';

const requiredEnv = {
  OPENAI_API_KEY: 'test-openai',
  BUFFER_ACCESS_TOKEN: 'buffer-token',
  GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: '{}',
  SMTP_URL: 'https://smtp.test',
  SUPABASE_URL: 'https://supabase.test',
  SUPABASE_ANON_KEY: 'anon',
  RUNWAY_API_KEY: 'runway',
  PIKA_API_KEY: 'pika',
  WEBHOOK_SIGNING_SECRET: 'secret'
};

beforeEach(() => {
  resetEnvCacheForTesting();
  Object.assign(process.env, requiredEnv);
});

afterEach(() => {
  resetEnvCacheForTesting();
  Object.keys(requiredEnv).forEach((key) => {
    delete process.env[key as keyof typeof process.env];
  });
});

describe('env', () => {
  it('loads env when variables are present', () => {
    const env = loadEnv();
    expect(env.OPENAI_API_KEY).toBe('test-openai');
  });

  it('throws when required variables missing', () => {
    delete process.env.OPENAI_API_KEY;
    expect(() => loadEnv()).toThrow();
  });
});
