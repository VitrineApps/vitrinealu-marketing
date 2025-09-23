import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  clean: true,
  outDir: 'dist',
  dts: false, // Disable DTS generation temporarily due to fluent-ffmpeg issues
  external: ['fluent-ffmpeg'],
  noExternal: ['pino', 'yaml', 'zod'],
});