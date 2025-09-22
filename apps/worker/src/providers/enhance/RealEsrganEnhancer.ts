import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import sharp from 'sharp';
import { env } from '../../config.js';
import { EnhanceProvider } from './EnhanceProvider.js';

export class RealEsrganEnhancer implements EnhanceProvider {
  name = 'real-esrgan';

  isAvailable(): boolean {
    return Boolean(env.REAL_ESRGAN_BIN);
  }

  async enhance(inputPath: string, outputPath: string): Promise<{ scale: number; ms: number }> {
    if (!env.REAL_ESRGAN_BIN) {
      throw new Error('REAL_ESRGAN_BIN not configured');
    }
    const scale = env.ENHANCE_DEFAULT_SCALE ?? 2;
    const start = Date.now();
    await new Promise<void>((resolve, reject) => {
      const child = spawn(env.REAL_ESRGAN_BIN!, [
        '-i', inputPath,
        '-o', outputPath,
        '-s', scale.toString(),
        '-f', 'jpg'
      ], { stdio: 'inherit' });
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`RealESRGAN exited with code ${code}`));
        }
      });
    });
    await access(outputPath);
    let finalScale = scale;
    if (env.ENHANCE_KEEP_SCALE && scale > 2) {
      // Shrink back to ~2x
      const metadata = await sharp(outputPath).metadata();
      const targetWidth = Math.round((metadata.width || 0) / scale * 2);
      const targetHeight = Math.round((metadata.height || 0) / scale * 2);
      await sharp(outputPath)
        .resize(targetWidth, targetHeight)
        .jpeg()
        .toFile(outputPath + '.tmp');
      await sharp(outputPath + '.tmp').toFile(outputPath);
      finalScale = 2;
    }
    const ms = Date.now() - start;
    return { scale: finalScale, ms };
  }
}