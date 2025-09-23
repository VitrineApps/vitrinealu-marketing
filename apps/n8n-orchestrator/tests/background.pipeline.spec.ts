import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { runBackgroundTask } from '../src/pipelines/background.js';
import { BackgroundJob } from '../src/types/background.js';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('child_process');
vi.mock('fs');
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null })),
        })),
      })),
      insert: vi.fn(() => Promise.resolve({})),
    })),
  })),
}));

const mockSpawn = vi.mocked(spawn);
const mockExistsSync = vi.mocked(existsSync);

describe('runBackgroundTask', () => {
  const mockJob: BackgroundJob = {
    mediaId: 'test-media',
    inputPath: '/input.jpg',
    outputPath: '/output.jpg',
    projectId: 'test-project',
    product: 'kitchen',
    tags: ['outdoor'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
  });

  it('should execute background replacement successfully', async () => {
    const mockProcess = {
      stdout: { on: vi.fn((event, cb) => cb('{"engine":"diffusion","preset":"open_plan_kitchen"}')) },
      stderr: { on: vi.fn() },
      on: vi.fn((event, cb) => {
        if (event === 'close') cb(0);
      }),
    };
    // @ts-expect-error
    mockSpawn.mockReturnValue(mockProcess as any);

    const result = await runBackgroundTask(mockJob);

    expect(mockSpawn).toHaveBeenCalledWith('python', expect.arrayContaining(['-m', 'services.background.cli']));
    expect(result).toEqual({
      engine: 'diffusion',
      preset: 'open_plan_kitchen',
    });
  });

  it('should skip if output exists and matches DB', async () => {
    mockExistsSync.mockReturnValue(true);
    // Mock the supabase instance
    const result = await runBackgroundTask(mockJob);

    expect(result).toBeNull();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('should handle process failure', async () => {
    const mockProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn((event, cb) => cb('Error occurred')) },
      on: vi.fn((event, cb) => {
        if (event === 'close') cb(1);
      }),
    };
    mockSpawn.mockReturnValue(mockProcess as any);

    await expect(runBackgroundTask(mockJob)).rejects.toThrow('Process exited with code 1');
  });

  it('should choose preset based on routing rules', async () => {
    const mockProcess = {
      stdout: { on: vi.fn((event, cb) => cb('{"engine":"diffusion","preset":"modern_garden_day"}')) },
      stderr: { on: vi.fn() },
      on: vi.fn((event, cb) => {
        if (event === 'close') cb(0);
      }),
    };
    mockSpawn.mockReturnValue(mockProcess as any);

    await runBackgroundTask(mockJob);

    expect(mockSpawn).toHaveBeenCalledWith('python', expect.arrayContaining(['--preset', 'modern_garden_day']));
  });
});