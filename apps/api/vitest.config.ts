import path from 'node:path';
import { defineConfig } from 'vitest/config';

const fromRoot = (...segments: string[]) => path.resolve(__dirname, ...segments);

export default defineConfig({
  resolve: {
    alias: {
      '@vitrinealu/shared': fromRoot('../../packages/shared/src'),
    }
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules', 'dist', '.turbo', '.next'],
    passWithNoTests: true,
    setupFiles: ['./vitest.setup.ts']
  }
});