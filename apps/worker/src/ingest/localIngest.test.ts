import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { resolveInputRoot, listNewFiles, markSeen, IngestFile } from '../ingest/localIngest.js';

// Mock fs and path
vi.mock('node:fs/promises');
vi.mock('node:path');
vi.mock('fast-glob');

describe('localIngest', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-ingest-'));
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('resolveInputRoot', () => {
    it('returns env var if set', async () => {
      process.env.LOCAL_INPUT_DIR = '/test/path';
      const result = await resolveInputRoot();
      expect(result).toBe('/test/path');
    });

    it('falls back to config file', async () => {
      delete process.env.LOCAL_INPUT_DIR;
      const mockReadFile = vi.mocked(fs.readFile);
      mockReadFile.mockResolvedValue('ingest:\n  local_source: "/config/path"');
      const result = await resolveInputRoot();
      expect(result).toBe('/config/path');
    });
  });

  describe('listNewFiles', () => {
    it('filters files by min_bytes', async () => {
      const mockGlob = (await import('fast-glob')).glob as any;
      mockGlob.mockResolvedValue([
        { path: '/input/small.jpg', stats: { size: 1000, mtimeMs: Date.now() } },
        { path: '/input/large.jpg', stats: { size: 100000, mtimeMs: Date.now() } }
      ]);

      const files = await listNewFiles();
      expect(files.length).toBe(1);
      expect(files[0].path).toBe('/input/large.jpg');
    });

    it('filters hidden files', async () => {
      const mockGlob = (await import('fast-glob')).glob as any;
      mockGlob.mockResolvedValue([
        { path: '/input/.hidden.jpg', stats: { size: 100000, mtimeMs: Date.now() } },
        { path: '/input/normal.jpg', stats: { size: 100000, mtimeMs: Date.now() } }
      ]);

      const files = await listNewFiles();
      expect(files.length).toBe(1);
      expect(files[0].path).toBe('/input/normal.jpg');
    });

    it('deduplicates seen files', async () => {
      // Mock database
      const mockDb = {
        prepare: vi.fn().mockReturnValue({
          get: vi.fn().mockReturnValue({ mtime_ms: Date.now() - 1000 })
        })
      };
      vi.doMock('better-sqlite3', () => ({ default: vi.fn().mockReturnValue(mockDb) }));

      const mockGlob = (await import('fast-glob')).glob as any;
      mockGlob.mockResolvedValue([
        { path: '/input/seen.jpg', stats: { size: 100000, mtimeMs: Date.now() } }
      ]);

      const files = await listNewFiles();
      expect(files.length).toBe(0);
    });
  });

  describe('markSeen', () => {
    it('marks files as seen', async () => {
      const mockDb = {
        prepare: vi.fn().mockReturnValue({
          run: vi.fn()
        }),
        transaction: vi.fn().mockReturnValue({
          default: vi.fn()
        })
      };
      vi.doMock('better-sqlite3', () => ({ default: vi.fn().mockReturnValue(mockDb) }));

      const files: IngestFile[] = [
        { path: '/input/test.jpg', size: 100000, mtimeMs: Date.now() }
      ];

      await markSeen(files);
      expect(mockDb.prepare).toHaveBeenCalledWith('INSERT OR REPLACE INTO ingest_seen (path, mtime_ms) VALUES (?, ?)');
    });
  });
});