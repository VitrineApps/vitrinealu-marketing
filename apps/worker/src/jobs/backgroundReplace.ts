import { fetch } from 'undici';
import FormData from 'form-data';
import { logger } from '@vitrinealu/shared/logger';
import { driveHelpers } from '../lib/drive.js';
import { env } from '../config.js';
import type { BackgroundCleanupJobData, BackgroundReplaceJobData } from './types.js';

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { decode } from 'jpeg-js';

interface EnhanceServiceResponse {
  assetId: string;
  outputUrl: string;
  metadata: {
    engine: string;
    mode: string;
    prompt?: string;
    processing_time_ms: number;
    dimensions: {
      width: number;
      height: number;
    };
    validations: string[];
  };
}

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitter: true,
};

// Circuit breaker state
let circuitBreakerFailures = 0;
const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
let circuitBreakerOpenUntil = 0;

/**
 * Sleep for specified milliseconds
 */
async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay for exponential backoff with optional jitter
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = Math.min(
    config.baseDelayMs * Math.pow(2, attempt),
    config.maxDelayMs
  );

  if (config.jitter) {
    // Add jitter: random value between 0.5 and 1.5 times the delay
    const jitterFactor = 0.5 + Math.random();
    return Math.floor(exponentialDelay * jitterFactor);
  }

  return exponentialDelay;
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: any): boolean {
  // Network errors and timeouts are retryable
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
    return true;
  }

  // HTTP 429 (rate limit) and 5xx errors are retryable
  if (error.status) {
    return error.status === 429 || (error.status >= 500 && error.status < 600);
  }

  // Fetch timeout errors
  if (error.name === 'TimeoutError' || error.message?.includes('timeout')) {
    return true;
  }

  return false;
}

/**
 * Execute function with retry logic and exponential backoff
 */
async function executeWithRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  context: string = 'operation'
): Promise<T> {
  if (Date.now() < circuitBreakerOpenUntil) {
    throw new Error(`Circuit breaker is open due to repeated failures. Opens until ${new Date(circuitBreakerOpenUntil).toISOString()}`);
  }

  let lastError: Error;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const result = await fn();
      circuitBreakerFailures = 0;
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === config.maxRetries) {
        logger.error({
          context,
          attempt: attempt + 1,
          maxRetries: config.maxRetries + 1,
          error: lastError.message,
        }, 'All retry attempts exhausted');
        break;
      }

      if (!isRetryableError(error)) {
        logger.debug({
          context,
          error: lastError.message,
        }, 'Non-retryable error, not retrying');
        throw lastError;
      }

      const delay = calculateDelay(attempt, config);
      logger.warn({
        context,
        attempt: attempt + 1,
        maxRetries: config.maxRetries + 1,
        delayMs: delay,
        error: lastError.message,
      }, 'Request failed, retrying');

      await sleep(delay);
    }
  }

  circuitBreakerFailures++;
  if (circuitBreakerFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    circuitBreakerOpenUntil = Date.now() + CIRCUIT_BREAKER_TIMEOUT_MS;
    logger.warn({ failures: circuitBreakerFailures, openUntil: new Date(circuitBreakerOpenUntil).toISOString() }, 'Circuit breaker opened due to repeated failures');
  }

  throw lastError!;
}

/**
 * Call the enhance service for background cleaning
 */
async function callEnhanceService(
  inputBuffer: Buffer,
  mode: 'clean' | 'replace',
  prompt?: string
): Promise<EnhanceServiceResponse> {
  const enhanceServiceUrl = env.ENHANCE_SERVICE_URL || 'http://localhost:8000';
  const endpoint = mode === 'clean' ? '/background/clean' : '/background/replace';
  
  return executeWithRetry(async () => {
    const formData = new FormData();
    formData.append('file', inputBuffer, {
      filename: 'input.jpg',
      contentType: 'image/jpeg',
    });

    if (mode === 'replace' && prompt) {
      formData.append('prompt', prompt);
    }

    formData.append('maskStrategy', 'product');

    logger.debug({
      endpoint: `${enhanceServiceUrl}${endpoint}`,
      mode,
      hasPrompt: !!prompt,
      inputSize: inputBuffer.length,
    }, 'Calling enhance service');

    const response = await fetch(`${enhanceServiceUrl}${endpoint}`, {
      method: 'POST',
      body: formData,
      headers: {
        ...formData.getHeaders(),
        'User-Agent': 'VitrineAlu-Worker/1.0',
      },
      // 60 second timeout for background processing
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Enhance service responded with ${response.status}: ${errorText}`);
    }

    const result = await response.json() as EnhanceServiceResponse;
    
    logger.info({
      assetId: result.assetId,
      outputUrl: result.outputUrl,
      engine: result.metadata.engine,
      processingTimeMs: result.metadata.processing_time_ms,
      dimensions: result.metadata.dimensions,
      validations: result.metadata.validations,
    }, 'Enhance service completed successfully');

    return result;
  }, DEFAULT_RETRY_CONFIG, `enhance-service-${mode}`);
}

/**
 * Download image from URL and validate
 */
async function downloadAndValidateImage(
  url: string,
  originalBuffer: Buffer,
  expectedMode: string,
  inputDimensions: { width: number; height: number }
): Promise<Buffer> {
  return executeWithRetry(async () => {
    logger.debug({ url }, 'Downloading processed image');

    const response = await fetch(url, {
      signal: AbortSignal.timeout(30000), // 30 second timeout for download
    });

    if (!response.ok) {
      throw new Error(`Failed to download processed image: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Validate output
    if (buffer.length === 0) {
      throw new Error('Downloaded image is empty');
    }

    const outputDecoded = decode(buffer, { useTArray: true });
    if (outputDecoded.width !== inputDimensions.width || outputDecoded.height !== inputDimensions.height) {
      throw new Error(`Output dimensions ${outputDecoded.width}x${outputDecoded.height} do not match input ${inputDimensions.width}x${inputDimensions.height}`);
    }

    // Check if image has alpha channel (indicating watermark/blur processing)
    const hasAlpha = outputDecoded.data.length === outputDecoded.width * outputDecoded.height * 4;
    if (!hasAlpha) {
      logger.warn('Output image does not have alpha channel, watermark/blur may not be applied');
    }

    // Check if output is different from input (hash comparison)
    const originalHash = crypto.createHash('md5').update(originalBuffer).digest('hex');
    const outputHash = crypto.createHash('md5').update(buffer).digest('hex');
    
    if (originalHash === outputHash) {
      logger.warn({
        originalHash,
        outputHash,
        mode: expectedMode,
      }, 'Output image appears identical to input - processing may have failed');
      // Don't throw error, but log warning
    }

    // Basic image format validation
    if (!buffer.subarray(0, 4).includes(0xFF) && !buffer.subarray(0, 8).includes(0x89)) {
      logger.warn({ 
        firstBytes: buffer.subarray(0, 8).toString('hex'),
      }, 'Output may not be a valid image format');
    }

    logger.debug({
      originalSize: originalBuffer.length,
      outputSize: buffer.length,
      sizeDifference: buffer.length - originalBuffer.length,
    }, 'Image validation completed');

    return buffer;
  }, DEFAULT_RETRY_CONFIG, 'download-processed-image');
}

/**
 * Background cleanup job - calls enhance service for background cleaning
 */
export async function backgroundCleanupJob(data: BackgroundCleanupJobData): Promise<{
  kind: 'backgroundCleanup';
  url: string;
  metadata: {
    engine: string;
    processingTimeMs: number;
    dimensions: { width: number; height: number };
    validations: string[];
  };
}> {
  const startTime = Date.now();
  
  logger.info({
    fileId: data.fileId,
    mode: data.mode || 'clean',
    hasPrompt: !!data.prompt,
  }, 'Starting background cleanup job');

  try {
    // Download input image
    const { buffer: inputBuffer } = await driveHelpers.downloadFile(data.fileId);
    const metadata = await driveHelpers.getFileMetadata(data.fileId);

    const inputDecoded = decode(inputBuffer, { useTArray: true });
    const inputDimensions = { width: inputDecoded.width, height: inputDecoded.height };

    logger.debug({
      fileId: data.fileId,
      inputSize: inputBuffer.length,
      mimeType: metadata.mimeType,
    }, 'Downloaded input image');

    // Call enhance service
    const mode = data.mode === 'replace' ? 'replace' : 'clean';
    const enhanceResult = await callEnhanceService(inputBuffer, mode, data.prompt);

    // Download processed image
    const processedBuffer = await downloadAndValidateImage(
      enhanceResult.outputUrl,
      inputBuffer,
      mode,
      inputDimensions
    );

    // Post-processing is handled by FastAPI
    const finalBuffer = processedBuffer;

    // Upload to ready folder
    const suffix = mode === 'replace' ? 'background-replace' : 'background-clean';
    const readyFolder = await driveHelpers.ensureReadyPath(new Date());
    const upload = await driveHelpers.uploadFile({
      name: ensureNameWithSuffix(metadata.name, suffix, '.jpg'),
      mimeType: 'image/jpeg',
      data: finalBuffer,
      parents: [readyFolder],
    });

    const totalTimeMs = Date.now() - startTime;
    
    logger.info({
      fileId: data.fileId,
      newFileId: upload.id,
      mode,
      engine: enhanceResult.metadata.engine,
      processingTimeMs: enhanceResult.metadata.processing_time_ms,
      totalTimeMs,
      finalSize: finalBuffer.length,
    }, 'Background cleanup job completed successfully');

    return {
      kind: 'backgroundCleanup',
      url: upload.webContentLink || upload.webViewLink || '',
      metadata: {
        engine: enhanceResult.metadata.engine,
        processingTimeMs: totalTimeMs,
        dimensions: enhanceResult.metadata.dimensions,
        validations: enhanceResult.metadata.validations,
      },
    };

  } catch (error) {
    const totalTimeMs = Date.now() - startTime;
    
    logger.error({
      fileId: data.fileId,
      mode: data.mode,
      error: error instanceof Error ? error.message : error,
      totalTimeMs,
    }, 'Background cleanup job failed');

    throw error;
  }
}

/**
 * Background replace job - calls enhance service for background replacement
 */
export async function backgroundReplaceJob(data: BackgroundReplaceJobData): Promise<{
  kind: 'backgroundReplace';
  jobId: string;
  metadata: {
    engine: string;
    processingTimeMs: number;
    outputUrl: string;
  };
}> {
  const jobId = crypto.randomUUID();
  const startTime = Date.now();

  logger.info({
    jobId,
    mediaId: data.mediaId,
    projectId: data.projectId,
    hasPrompt: !!data.preset,
  }, 'Starting background replace job');

  try {
    // Read input file
    const inputBuffer = fs.readFileSync(data.inputPath);
    
    const inputDecoded = decode(inputBuffer, { useTArray: true });
    const inputDimensions = { width: inputDecoded.width, height: inputDecoded.height };
    
    // Determine prompt from preset or use provided prompt
    let prompt = data.preset || 'modern, elegant interior, natural light, realistic, premium';
    if (data.overrides?.prompt) {
      prompt = data.overrides.prompt as string;
    }

    // Call enhance service
    const enhanceResult = await callEnhanceService(inputBuffer, 'replace', prompt);

    // Download and validate processed image
    const processedBuffer = await downloadAndValidateImage(
      enhanceResult.outputUrl,
      inputBuffer,
      'replace',
      inputDimensions
    );

    // Post-processing is handled by FastAPI
    const finalBuffer = processedBuffer;

    // Save to output path (or upload to storage)
    const outputPath = `/tmp/background-${data.mediaId}-${Date.now()}.jpg`;
    fs.writeFileSync(outputPath, finalBuffer);

    const totalTimeMs = Date.now() - startTime;

    // Emit success event if callback URL provided
    if (data.callbackUrl) {
      try {
        await fetch(data.callbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId,
            mediaId: data.mediaId,
            status: 'completed',
            outputPath,
            metadata: {
              engine: enhanceResult.metadata.engine,
              processingTimeMs: totalTimeMs,
            },
          }),
        });
      } catch (callbackError) {
        logger.warn({
          jobId,
          callbackUrl: data.callbackUrl,
          error: callbackError instanceof Error ? callbackError.message : callbackError,
        }, 'Failed to send callback notification');
      }
    }

    logger.info({
      jobId,
      mediaId: data.mediaId,
      outputPath,
      engine: enhanceResult.metadata.engine,
      processingTimeMs: enhanceResult.metadata.processing_time_ms,
      totalTimeMs,
    }, 'Background replace job completed successfully');

    return {
      kind: 'backgroundReplace',
      jobId,
      metadata: {
        engine: enhanceResult.metadata.engine,
        processingTimeMs: totalTimeMs,
        outputUrl: outputPath,
      },
    };

  } catch (error) {
    const totalTimeMs = Date.now() - startTime;

    // Send failure callback if provided
    if (data.callbackUrl) {
      try {
        await fetch(data.callbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId,
            mediaId: data.mediaId,
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          }),
        });
      } catch (callbackError) {
        logger.warn({
          jobId,
          callbackUrl: data.callbackUrl,
          error: callbackError instanceof Error ? callbackError.message : callbackError,
        }, 'Failed to send failure callback notification');
      }
    }

    logger.error({
      jobId,
      mediaId: data.mediaId,
      error: error instanceof Error ? error.message : error,
      totalTimeMs,
    }, 'Background replace job failed');

    throw error;
  }
}

/**
 * Helper function to ensure name with suffix (moved from processor.ts)
 */
function ensureNameWithSuffix(originalName: string | null | undefined, suffix: string, extensionFallback: string): string {
  const base = originalName ? path.parse(originalName).name : 'asset';
  const ext = originalName ? path.parse(originalName).ext || extensionFallback : extensionFallback;
  return `${base}-${suffix}${ext}`;
}