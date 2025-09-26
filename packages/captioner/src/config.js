import { config } from 'dotenv';
import { z } from 'zod';
config();
const configSchema = z.object({
    OPENAI_API_KEY: z.string().optional(),
    GEMINI_API_KEY: z.string().optional(),
    DEFAULT_LLM_PROVIDER: z.enum(['openai', 'gemini']).default('openai'),
    MODEL_NAME: z.string().default('gpt-4'),
});
export const env = configSchema.parse(process.env);
