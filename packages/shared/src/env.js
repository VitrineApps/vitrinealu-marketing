import { config } from 'dotenv';
import { z } from 'zod';
const envSchema = z
    .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
    BUFFER_ACCESS_TOKEN: z.string().min(1, 'BUFFER_ACCESS_TOKEN is required'),
    GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: z.string().min(1, 'Service account JSON is required'),
    SMTP_URL: z.string().url('SMTP_URL must be a valid URL'),
    SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
    SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY is required'),
    RUNWAY_API_KEY: z.string().min(1, 'RUNWAY_API_KEY is required'),
    PIKA_API_KEY: z.string().optional(),
    REAL_ESRGAN_BIN: z.string().optional(),
    WEBHOOK_SIGNING_SECRET: z.string().optional(),
    TIMEZONE: z.string().default('Europe/London')
})
    .transform((value) => ({
    ...value,
    TIMEZONE: value.TIMEZONE || 'Europe/London'
}));
let cachedEnv = null;
export const loadEnv = (options) => {
    if (!cachedEnv) {
        config({ path: options?.path });
        const parsed = envSchema.safeParse(process.env);
        if (!parsed.success) {
            const formatted = parsed.error.issues
                .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
                .join(', ');
            throw new Error(`Invalid environment configuration: ${formatted}`);
        }
        cachedEnv = parsed.data;
    }
    return cachedEnv;
};
export const getEnv = () => {
    if (!cachedEnv) {
        throw new Error('Environment not loaded. Call loadEnv() during startup.');
    }
    return cachedEnv;
};
export const resetEnvCacheForTesting = () => {
    cachedEnv = null;
};
//# sourceMappingURL=env.js.map