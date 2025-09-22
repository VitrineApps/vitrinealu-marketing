import { z } from 'zod';
import * as path from 'path';
import { readFileSync } from 'fs';
import * as crypto from 'crypto';
import * as YAML from 'yaml';

// Environment schema
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(8787),

  // Buffer API
  BUFFER_ACCESS_TOKEN: z.string().min(1, 'BUFFER_ACCESS_TOKEN is required'),

  // Email configuration
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SENDGRID_API_KEY: z.string().optional(),

  // Webhook configuration
  WEBHOOK_SECRET: z.string().min(32, 'WEBHOOK_SECRET must be at least 32 characters'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000,https://vitrinealu.com'),

  // Application
  APP_BASE_URL: z.string().url('APP_BASE_URL must be a valid URL'),
  OWNER_EMAIL: z.string().email('OWNER_EMAIL must be a valid email'),

  // Database
  DATABASE_URL: z.string().default('sqlite:./scheduler.db'),

  // Timezone
  TIMEZONE: z.string().default('Europe/London'),

  // Brand configuration
  BRAND_CONFIG_PATH: z.string().default('./config/brand.yaml'),
});

export type Config = z.infer<typeof envSchema>;

// Brand configuration schema
const brandConfigSchema = z.object({
  name: z.string(),
  timezone: z.string().default('Europe/London'),
  quietHours: z.object({
    start: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/), // HH:MM format
    end: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
    days: z.array(z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])).default(['saturday', 'sunday'])
  }).optional(),
  platforms: z.record(z.object({
    enabled: z.boolean().default(true),
    optimalTimes: z.array(z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)).optional(),
    bufferChannelId: z.string().optional()
  })).optional()
});

export type BrandConfig = z.infer<typeof brandConfigSchema>;

class ConfigManager {
  private _config: Config;
  private _brandConfig: BrandConfig | null = null;

  constructor() {
    this._config = envSchema.parse(process.env);
  }

  get config(): Config {
    return this._config;
  }

  get brandConfig(): BrandConfig {
    if (!this._brandConfig) {
      try {
        const configPath = path.resolve(this._config.BRAND_CONFIG_PATH);
        const configContent = readFileSync(configPath, 'utf-8');
        this._brandConfig = brandConfigSchema.parse(YAML.parse(configContent));
      } catch (error) {
        // Use defaults if config file doesn't exist
        this._brandConfig = brandConfigSchema.parse({
          name: 'VitrineAlu',
          timezone: this._config.TIMEZONE
        });
      }
    }
    return this._brandConfig;
  }

  // Validate email configuration
  validateEmailConfig(): void {
    const hasSmtp = this.config.SMTP_HOST && this.config.SMTP_USER && this.config.SMTP_PASS;
    const hasSendgrid = this.config.SENDGRID_API_KEY;

    if (!hasSmtp && !hasSendgrid) {
      throw new Error('Email configuration required: either SMTP_* variables or SENDGRID_API_KEY');
    }
  }

  // Get webhook URL for approvals
  getWebhookUrl(postId: string, action: 'approve' | 'reject'): string {
    const token = this.generateWebhookToken(postId, action);
    return `${this._config.APP_BASE_URL}/webhooks/approval?token=${token}&postId=${postId}&action=${action}`;
  }

  // Generate HMAC token for webhook security
  private generateWebhookToken(postId: string, action: string): string {
    const hmac = crypto.createHmac('sha256', this._config.WEBHOOK_SECRET);
    hmac.update(`${postId}:${action}:${Date.now()}`);
    return hmac.digest('hex');
  }

  get webhookConfig(): { secret: string; allowedOrigins: string[] } {
    return {
      secret: this._config.WEBHOOK_SECRET,
      allowedOrigins: this._config.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
    };
  }
}

export const config = new ConfigManager();