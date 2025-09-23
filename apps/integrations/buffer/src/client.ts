import { z } from 'zod';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import * as path from 'path';
import {
  CreateMultiAssetUpdateParams,
  CreateMultiAssetUpdateParamsSchema,
  MultiAssetUpdateResponse,
  MultiAssetUpdateResponseSchema,
  FileValidation,
  ChunkedUpdate,
  Platform,
  NetworkConstraints,
  RetryConfig,
  BufferMultiAssetError,
  ValidationError,
  PlatformLimitError
} from './types.js';

// Buffer API payload interface
interface BufferApiPayload {
  profile_ids: string[];
  text: string;
  media: {
    picture: string;
  };
  scheduled_at?: number;
  shortlink?: boolean;
  utm?: Record<string, string>;
}

// Load network constraints synchronously
const networksConfigPath = path.join(process.cwd(), 'apps/integrations/buffer/src/config/networks.json');
const networkConstraints: Record<string, NetworkConstraints> = JSON.parse(
  fsSync.readFileSync(networksConfigPath, 'utf-8')
);

export class BufferMultiAssetClient {
  private accessToken: string;
  private baseUrl = 'https://api.bufferapp.com/1';
  private retryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffFactor: 2
  };

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  /**
   * Validate files for multi-asset upload
   */
  private async validateFiles(filePaths: string[]): Promise<FileValidation[]> {
    const validations: FileValidation[] = [];

    for (const filePath of filePaths) {
      const validation: FileValidation = {
        path: filePath,
        exists: false,
        isValid: false
      };

      try {
        const stats = await fs.stat(filePath);
        validation.exists = true;
        validation.size = stats.size;

        // Read first few bytes to determine MIME type
        const buffer = await fs.readFile(filePath);
        const mimeType = this.detectMimeType(buffer.subarray(0, Math.min(512, buffer.length)));
        validation.mimeType = mimeType;

        // Validate MIME type and size
        const isValidFormat = mimeType?.startsWith('image/') ?? false;
        const isValidSize = validation.size <= 10 * 1024 * 1024; // 10MB max

        if (!isValidFormat) {
          validation.error = `Unsupported file format: ${mimeType}`;
        } else if (!isValidSize) {
          validation.error = `File too large: ${validation.size} bytes (max 10MB)`;
        } else {
          validation.isValid = true;
        }
      } catch (error) {
        validation.error = `File access error: ${error instanceof Error ? error.message : String(error)}`;
      }

      validations.push(validation);
    }

    return validations;
  }

  /**
   * Simple MIME type detection from file header
   */
  private detectMimeType(buffer: Buffer): string | undefined {
    if (buffer.length < 4) return undefined;

    const header = buffer.subarray(0, 4);

    // JPEG
    if (header[0] === 0xFF && header[1] === 0xD8) return 'image/jpeg';

    // PNG
    if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) return 'image/png';

    // WebP
    if (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46) return 'image/webp';

    // GIF
    if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46) return 'image/gif';

    return undefined;
  }

  /**
   * Chunk files based on platform constraints
   */
  private chunkFilesForPlatform(
    filePaths: string[],
    platform: Platform,
    subtype?: string
  ): ChunkedUpdate[] {
    const constraints = networkConstraints[platform];
    if (!constraints) {
      throw new BufferMultiAssetError(
        `Unsupported platform: ${platform}`,
        'UNSUPPORTED_PLATFORM',
        400,
        false
      );
    }

    const maxAssets = subtype && constraints.subtypes?.[subtype]?.maxAssets
      ? constraints.subtypes[subtype].maxAssets
      : constraints.maxAssets;

    if (filePaths.length > maxAssets) {
      throw new PlatformLimitError(platform, maxAssets, filePaths.length);
    }

    // For single post platforms or when we have <= maxAssets, return single chunk
    if (maxAssets === 1 || filePaths.length <= maxAssets) {
      return [{
        profileId: '', // Will be set by caller
        text: '', // Will be set by caller
        media: { files: filePaths },
        scheduledAt: undefined,
        shortlink: undefined,
        utm: undefined
      }];
    }

    // For carousel/multi-asset support, chunk into multiple posts
    const chunks: ChunkedUpdate[] = [];
    for (let i = 0; i < filePaths.length; i += maxAssets) {
      chunks.push({
        profileId: '', // Will be set by caller
        text: '', // Will be set by caller
        media: { files: filePaths.slice(i, i + maxAssets) },
        scheduledAt: undefined,
        shortlink: undefined,
        utm: undefined
      });
    }

    return chunks;
  }

  /**
   * Make HTTP request with retry logic
   */
  private async requestWithRetry<T>(
    endpoint: string,
    options: RequestInit = {},
    requestId?: string
  ): Promise<T> {
    let lastError: BufferMultiAssetError | Error;
    const reqId = requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const url = `${this.baseUrl}${endpoint}?access_token=${this.accessToken}`;

        console.log(`[BufferMultiAsset] ${reqId} Attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1} - ${options.method || 'GET'} ${url}`);

        const response = await fetch(url, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': reqId,
            ...options.headers
          }
        });

        console.log(`[BufferMultiAsset] ${reqId} Response: ${response.status} ${response.statusText}`);

        // Success
        if (response.ok) {
          const data = await response.json();
          console.log(`[BufferMultiAsset] ${reqId} Success`);
          return data as T;
        }

        // Don't retry on client errors (4xx except 429)
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          const errorText = await response.text();
          throw new BufferMultiAssetError(
            `Buffer API client error: ${response.status} ${errorText}`,
            'CLIENT_ERROR',
            response.status,
            false
          );
        }

        // Retry on 429 (rate limit) and 5xx errors
        if (response.status === 429 || response.status >= 500) {
          lastError = new BufferMultiAssetError(
            `Buffer API server error: ${response.status}`,
            response.status === 429 ? 'RATE_LIMIT' : 'SERVER_ERROR',
            response.status,
            true
          );

          if (attempt < this.retryConfig.maxRetries) {
            const delay = Math.min(
              this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffFactor, attempt),
              this.retryConfig.maxDelay
            );
            console.log(`[BufferMultiAsset] ${reqId} Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        } else {
          const errorText = await response.text();
          lastError = new BufferMultiAssetError(
            `Buffer API error: ${response.status} ${errorText}`,
            'API_ERROR',
            response.status,
            false
          );
        }

        break;
      } catch (error) {
        lastError = error instanceof BufferMultiAssetError ? error : new BufferMultiAssetError(
          `Request failed: ${error instanceof Error ? error.message : String(error)}`,
          'NETWORK_ERROR',
          undefined,
          true
        );

        if (attempt < this.retryConfig.maxRetries && lastError instanceof BufferMultiAssetError && lastError.retryable) {
          const delay = Math.min(
            this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffFactor, attempt),
            this.retryConfig.maxDelay
          );
          console.log(`[BufferMultiAsset] ${reqId} Network error, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        break;
      }
    }

    throw lastError!;
  }

  /**
   * Create multi-asset update with platform-aware chunking
   */
  async createMultiAssetUpdate(params: CreateMultiAssetUpdateParams): Promise<MultiAssetUpdateResponse> {
    // Validate input parameters
    const validatedParams = CreateMultiAssetUpdateParamsSchema.parse(params);

    // Validate files
    const fileValidations = await this.validateFiles(validatedParams.media.files);
    const invalidFiles = fileValidations.filter(v => !v.isValid);

    if (invalidFiles.length > 0) {
      throw new ValidationError('Invalid files provided', invalidFiles);
    }

    // Determine platform and constraints
    const platform = validatedParams.networkHints?.platform;
    if (!platform) {
      throw new BufferMultiAssetError(
        'networkHints.platform is required for multi-asset updates',
        'MISSING_PLATFORM',
        400,
        false
      );
    }

    // Chunk files based on platform constraints
    const chunks = this.chunkFilesForPlatform(
      validatedParams.media.files,
      platform,
      validatedParams.networkHints?.subtype
    );

    // Create updates for each chunk
    const chunkResults: Array<{ updateId: string; fileCount: number; platform: string }> = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // Prepare payload for Buffer API
      const payload: BufferApiPayload = {
        profile_ids: [validatedParams.profileId],
        text: i === 0 ? validatedParams.text : `${validatedParams.text} (${i + 1}/${chunks.length})`,
        media: {
          // Buffer API expects media as individual files
          // In practice, this would need to be handled differently for multi-asset
          // For now, we'll use the first file and note this is a limitation
          picture: chunk.media.files[0]
        },
        ...validatedParams.scheduledAt && { scheduled_at: Math.floor(new Date(validatedParams.scheduledAt).getTime() / 1000) },
        ...validatedParams.shortlink !== undefined && { shortlink: validatedParams.shortlink }
      };

      // Add UTM parameters if provided
      if (validatedParams.utm) {
        payload.utm = validatedParams.utm;
      }

      const data = await this.requestWithRetry('/updates/create.json', {
        method: 'POST',
        body: JSON.stringify(payload)
      }, `multi_asset_${i}`);

      // Parse response
      const updateSchema = z.object({
        success: z.boolean(),
        updates: z.array(z.object({
          id: z.string(),
          status: z.string(),
          scheduled_at: z.number().optional()
        })).optional()
      });

      const parsed = updateSchema.parse(data);

      if (!parsed.success || !parsed.updates?.[0]) {
        throw new BufferMultiAssetError(
          'Failed to create update',
          'CREATE_FAILED',
          500,
          true
        );
      }

      const update = parsed.updates[0];
      chunkResults.push({
        updateId: update.id,
        fileCount: chunk.media.files.length,
        platform
      });
    }

    // Return normalized response
    const response: MultiAssetUpdateResponse = {
      updateId: chunkResults[0].updateId, // Primary update ID
      status: 'draft' as const,
      chunks: chunkResults.length > 1 ? chunkResults : undefined
    };

    return MultiAssetUpdateResponseSchema.parse(response);
  }
}