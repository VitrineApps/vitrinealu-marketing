import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false,
  target: 'es2022',
  platform: 'node',
  outDir: 'dist',
  splitting: false,
  bundle: true,
  external: [
    '@vitrinealu/video-assembler',
    '@vitrinealu/captioner',
  ],
  noExternal: [
    'bullmq',
    'ioredis',
    'express',
    'cors',
    'helmet',
    'express-rate-limit',
    'pino',
    'zod',
  ],
  env: {
    NODE_ENV: process.env.NODE_ENV || 'development',
  },
});