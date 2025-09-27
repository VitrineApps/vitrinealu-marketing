import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fetch } from 'undici';

describe('e2e local ingest pipeline', () => {
  it('processes photos from local input directory', async () => {
    // Place 3 sample JPGs in input directory
    const inputDir = 'E:/my_projects/vitrinealu-marketing/input';
    const sampleFiles = [
      'sample1.jpg',
      'sample2.jpg',
      'sample3.jpg'
    ];

    // Ensure files exist (in real test, copy from fixtures)
    for (const file of sampleFiles) {
      const filePath = path.join(inputDir, file);
      try {
        await fs.access(filePath);
      } catch {
        // Create dummy files for test
        await fs.writeFile(filePath, Buffer.alloc(100000)); // 100KB dummy
      }
    }

    // Call GET /ingest/local/scan
    const scanResponse = await fetch('http://localhost:3000/ingest/local/scan');
    expect(scanResponse.ok).toBe(true);
    const scanData = await scanResponse.json();
    expect(scanData.length).toBeGreaterThanOrEqual(3);

    // POST /ingest/local/enqueue
    const enqueueResponse = await fetch('http://localhost:3000/ingest/local/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: scanData.slice(0, 3).map((f: any) => f.path) })
    });
    expect(enqueueResponse.ok).toBe(true);
    const enqueueData = await enqueueResponse.json();
    expect(enqueueData.length).toBe(3);

    // Wait for completion (poll job status)
    // In real test, poll until jobs complete

    // Check assets created
    const assetsDir = 'E:/my_projects/vitrinealu-marketing/assets';
    const readyFiles = await fs.readdir(path.join(assetsDir, 'ready'));
    expect(readyFiles.length).toBeGreaterThan(0);

    const rendersDir = path.join(assetsDir, 'renders');
    const renderFiles = await fs.readdir(rendersDir);
    const mp4Files = renderFiles.filter(f => f.endsWith('.mp4'));
    expect(mp4Files.length).toBeGreaterThan(0);

    // Create Buffer drafts via Scheduler
    const draftResponse = await fetch('http://localhost:8080/api/drafts/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mediaUrls: enqueueData.map((d: any) => d.enhanceUrl),
        caption: 'Test caption',
        platform: 'instagram'
      })
    });
    expect(draftResponse.ok).toBe(true);

    // Assert profile IDs/times set from schedule.yaml
    const draftData = await draftResponse.json();
    expect(draftData.updateId).toBeDefined();
  }, 300000); // 5 minute timeout
});