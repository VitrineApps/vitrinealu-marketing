import { z } from 'zod';

// Network platform types
export type Platform = 'instagram' | 'facebook' | 'twitter' | 'linkedin';
export type Subtype = 'carousel' | 'reel';

// Network constraints from config
export interface NetworkConstraints {
  maxAssets: number;
  maxFileSize: number;
  supportedFormats: string[];
  subtypes?: Record<string, {
    maxAssets: number;
    minAssets?: number;
  }>;
}

// Multi-asset update parameters
export const CreateMultiAssetUpdateParamsSchema = z.object({
  profileId: z.string(),
  text: z.string(),
  media: z.object({
    files: z.array(z.string()).min(1).max(10)
  }),
  scheduledAt: z.string().optional(),
  shortlink: z.boolean().optional(),
  utm: z.record(z.string()).optional(),
  networkHints: z.object({
    platform: z.enum(['instagram', 'facebook', 'twitter', 'linkedin']),
    subtype: z.enum(['carousel']).optional()
  }).optional()
});

export type CreateMultiAssetUpdateParams = z.infer<typeof CreateMultiAssetUpdateParamsSchema>;

// File validation result
export interface FileValidation {
  path: string;
  exists: boolean;
  mimeType?: string;
  size?: number;
  isValid: boolean;
  error?: string;
}

// Chunked update for platform constraints
export interface ChunkedUpdate {
  profileId: string;
  text: string;
  media: {
    files: string[];
  };
  scheduledAt?: string;
  shortlink?: boolean;
  utm?: Record<string, string>;
}

// Normalized response
export const MultiAssetUpdateResponseSchema = z.object({
  updateId: z.string(),
  status: z.enum(['draft', 'scheduled', 'published']),
  scheduledAt: z.string().optional(),
  chunks: z.array(z.object({
    updateId: z.string(),
    fileCount: z.number(),
    platform: z.string()
  })).optional()
});

export type MultiAssetUpdateResponse = z.infer<typeof MultiAssetUpdateResponseSchema>;

// Retry configuration
export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
}

// Error types
export class BufferMultiAssetError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'BufferMultiAssetError';
  }
}

export class ValidationError extends BufferMultiAssetError {
  constructor(message: string, public validationErrors: FileValidation[]) {
    super(message, 'VALIDATION_ERROR', 400, false);
    this.name = 'ValidationError';
  }
}

export class PlatformLimitError extends BufferMultiAssetError {
  constructor(platform: Platform, maxAssets: number, providedAssets: number) {
    super(
      `Platform ${platform} supports maximum ${maxAssets} assets, but ${providedAssets} were provided`,
      'PLATFORM_LIMIT_EXCEEDED',
      400,
      false
    );
    this.name = 'PlatformLimitError';
  }
}