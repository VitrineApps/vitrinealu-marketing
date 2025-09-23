// Captioner client: programmatic or CLI wrapper with retries

import { spawn } from 'child_process';
import path from 'path';

export interface GenerateForCarouselInput {
  mediaPaths: string[];
  platform: string;
  brandPath: string;
  seed?: number;
}

export async function generateForCarousel(input: GenerateForCarouselInput): Promise<any> {
  // Try programmatic import first
  try {
    const mod = await import('../../../packages/captioner/src/generate');
    if (mod.generateForCarousel) {
      // Cast platform to Platform for programmatic call
      return await mod.generateForCarousel({ ...input, platform: input.platform as any });
    }
  } catch (err) {
    // Fallback to CLI
  }
  // CLI fallback
  return new Promise((resolve, reject) => {
    const cliPath = path.resolve(__dirname, '../../../packages/captioner/bin/captioner');
    const args = ['carousel', '--platform', input.platform, '--brand', input.brandPath, '--media', ...input.mediaPaths];
    if (input.seed) args.push('--seed', String(input.seed));
    const proc = spawn('node', [cliPath, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    proc.stdout.on('data', d => { out += d; });
    proc.stderr.on('data', d => { /* ignore */ });
    proc.on('close', code => {
      if (code === 0) {
        try { resolve(JSON.parse(out)); } catch (e) { reject(e); }
      } else {
        reject(new Error('captioner CLI failed'));
      }
    });
  });
}

// Retry wrapper with backoff
export async function generateForCarouselWithRetry(input: GenerateForCarouselInput, maxRetries = 3): Promise<any> {
  let lastErr;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await generateForCarousel(input);
    } catch (err) {
      lastErr = err;
      await new Promise(res => setTimeout(res, 500 * (i + 1) + Math.random() * 500));
    }
  }
  throw lastErr;
}
