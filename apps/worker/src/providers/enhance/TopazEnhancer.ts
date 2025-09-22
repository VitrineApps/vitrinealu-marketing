import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { env } from '../../config.js';
import { EnhanceProvider } from './EnhanceProvider.js';

export class TopazEnhancer implements EnhanceProvider {
  name = 'topaz';

  isAvailable(): boolean {
    return Boolean(env.TOPAZ_CLI);
  }

  async enhance(inputPath: string, outputPath: string): Promise<{ scale: number; ms: number }> {
    if (!env.TOPAZ_CLI) {
      throw new Error('TOPAZ_CLI not configured');
    }
    const start = Date.now();
    await new Promise<void>((resolve, reject) => {
      const child = spawn(env.TOPAZ_CLI!, [
        '--input', inputPath,
        '--output', outputPath,
        '--preset', 'standard',
        '--scale', '2x',
        '--denoise', 'low'
      ], { stdio: 'inherit' });
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Topaz exited with code ${code}`));
        }
      });
    });
    await access(outputPath);
    const ms = Date.now() - start;
    return { scale: 2, ms };
  }
}