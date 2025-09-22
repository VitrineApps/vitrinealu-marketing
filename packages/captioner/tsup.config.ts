import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    dts: true,
    splitting: false,
    clean: true,
    bundle: true,
    banner: { js: '#!/usr/bin/env node' },
    sourcemap: true,
    external: ['commander', 'fs-extra', 'globby', 'p-limit', 'p-retry', 'pino', 'pino-pretty', 'yaml', 'zod', '@google/generative-ai', 'openai', 'dotenv', 'exifr'],
  },
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    clean: false,
    sourcemap: true,
  },
]);