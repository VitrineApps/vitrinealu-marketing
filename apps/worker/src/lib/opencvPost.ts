import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config.js';

export const runOpencvPost = async (inputPath: string, outputPath: string): Promise<string> => {
  const pythonBin = env.PYTHON_BIN ?? 'python';
  const scriptPath = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'scripts', 'opencv_post.py');

  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, [scriptPath, '--input', inputPath, '--output', outputPath], {
      stdio: 'inherit'
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error(`OpenCV post-processing failed with code ${code}`));
      }
    });
  });
};