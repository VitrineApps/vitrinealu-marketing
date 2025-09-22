import { copyFile } from 'node:fs/promises';
import { EnhanceProvider } from './EnhanceProvider.js';

export class NoopEnhancer implements EnhanceProvider {
  name = 'noop';

  isAvailable(): boolean {
    return true;
  }

  async enhance(inputPath: string, outputPath: string): Promise<{ scale: number; ms: number }> {
    await copyFile(inputPath, outputPath);
    return { scale: 1, ms: 0 };
  }
}