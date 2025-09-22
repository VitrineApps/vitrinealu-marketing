import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const envOverrides = vi.hoisted(() => ({
  OPENAI_API_KEY: 'test-openai',
  BUFFER_ACCESS_TOKEN: 'test-buffer',
  GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    client_email: 'worker@test',
    private_key: '-----BEGIN PRIVATE KEY-----\nMII...\n-----END PRIVATE KEY-----\n'
  }),
  SMTP_URL: 'smtp://user:pass@mail.local:587',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  RUNWAY_API_KEY: 'runway-test',
  PIKA_API_KEY: 'pika-test',
  TIMEZONE: 'Europe/London'
}));

Object.assign(process.env, envOverrides);

const insertMock = vi.hoisted(() => vi.fn().mockResolvedValue({ data: null, error: null }));

const driveMocks = vi.hoisted(() => ({
  downloadFile: vi.fn(async () => ({ buffer: Buffer.from('file-data'), cachePath: '/tmp/file' })),
  getFileMetadata: vi.fn(async () => ({ id: 'file', name: 'sample.png', mimeType: 'image/png' })),
  ensureReadyPath: vi.fn(async () => 'ready-folder'),
  ensureFolder: vi.fn(async () => 'folder-id'),
  uploadFile: vi.fn(async ({ name }: { name: string }) => ({
    id: `new-${name}`,
    webContentLink: `https://drive/${name}`
  }))
}));

const applyColorMock = vi.hoisted(() =>
  vi.fn(async (inputPath: string) => {
    const fs = await import('node:fs/promises');
    return fs.readFile(inputPath);
  })
);

vi.mock('../lib/drive.js', () => ({
  driveHelpers: driveMocks
}));

vi.mock('../lib/imageEnhance.js', () => ({
  applyColorExposureFix: applyColorMock
}));

vi.mock('../lib/supabase.js', () => ({
  getSupabase: () => ({
    from: () => ({ insert: insertMock })
  })
}));

vi.mock('undici', () => ({
  fetch: vi.fn(async () => ({
    json: async () => ({ update: { id: 'buffer-123' } })
  }))
}));

vi.mock('../config.js', async () => {
  const actual = await vi.importActual<typeof import('../config.js')>('../config.js');
  return actual;
});

let processMediaJob: (typeof import('../jobs/processor.js'))['processMediaJob'];

beforeAll(async () => {
  const mod = await import('../jobs/processor.js');
  processMediaJob = mod.processMediaJob;
});

beforeEach(() => {
  driveMocks.downloadFile.mockReset();
  driveMocks.downloadFile.mockResolvedValue({ buffer: Buffer.from('file-data'), cachePath: '/tmp/file' });
  driveMocks.uploadFile.mockClear();
  applyColorMock.mockClear();
});

const createJpeg = async (value: number) => {
  const { encode } = await import('jpeg-js');
  const pixel = Buffer.alloc(4);
  pixel[0] = value;
  pixel[1] = value;
  pixel[2] = value;
  pixel[3] = 255;
  const rawImageData = { data: pixel, width: 1, height: 1 };
  const encoded = encode(rawImageData, 90);
  return Buffer.from(encoded.data);
};

describe('processMediaJob', () => {
  it('computes hash', async () => {
    const result = await processMediaJob({ kind: 'hash', fileId: 'file-1' });
    if (result.kind !== 'hash') throw new Error('expected hash result');
    expect(result.hash).toHaveLength(64);
  });

  it('scores asset deterministically', async () => {
    driveMocks.downloadFile.mockResolvedValueOnce({
      buffer: await createJpeg(255),
      cachePath: '/tmp/file'
    });
    const bright = await processMediaJob({ kind: 'score', fileId: 'bright' });
    if (bright.kind !== 'score') throw new Error('expected score result');
    expect(bright.score).toBeGreaterThan(0.62);

    driveMocks.downloadFile.mockResolvedValueOnce({
      buffer: await createJpeg(0),
      cachePath: '/tmp/file'
    });
    const dark = await processMediaJob({ kind: 'score', fileId: 'dark' });
    if (dark.kind !== 'score') throw new Error('expected score result');
    expect(dark.score).toBeLessThan(0.5);
  });

  it('creates enhanced asset', async () => {
    const result = await processMediaJob({ kind: 'enhance', fileId: 'file-1' });
    if (result.kind !== 'enhance') throw new Error('expected enhance result');
    expect(result.url).toContain('https://drive/');
    expect(applyColorMock).toHaveBeenCalled();
  });

  it('generates caption', async () => {
    const result = await processMediaJob({ kind: 'caption', context: { title: 'New Asset' }, channel: 'instagram' });
    if (result.kind !== 'caption') throw new Error('expected caption result');
    expect(result.caption).toMatch(/instagram/);
    expect(result.hashtags).toContain('#instagram');
  });

  it('schedules buffer posts and returns ids', async () => {
    const result = await processMediaJob({
      kind: 'bufferSchedule',
      posts: [
        {
          text: 'Hello world',
          profileIds: ['profile-1'],
          scheduledAt: new Date().toISOString()
        }
      ]
    });
    if (result.kind !== 'bufferSchedule') throw new Error('expected buffer schedule result');
    expect(result.bufferIds).toHaveLength(1);
  });
});

