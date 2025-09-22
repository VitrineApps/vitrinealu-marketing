import { promises as fs } from 'fs';
import * as path from 'path';
import { JobRunner } from '../src/jobRunner';
describe('VideoAssembler Integration', () => {
    const testDir = path.join(__dirname, 'fixtures');
    const inputDir = path.join(testDir, 'job1');
    const outputPath = path.join(testDir, 'output.mp4');
    beforeAll(async () => {
        // Create test fixtures
        await fs.mkdir(inputDir, { recursive: true });
        // Create sample images (1x1 pixel PNGs for testing)
        const sampleImageBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
        await fs.writeFile(path.join(inputDir, 'image1.jpg'), sampleImageBuffer);
        await fs.writeFile(path.join(inputDir, 'image2.jpg'), sampleImageBuffer);
        // Create captions.json
        const captionsJson = {
            platform: 'instagram_reel',
            clips: [
                {
                    image: 'image1.jpg',
                    durationSec: 2,
                    pan: 'none',
                    zoom: 'none',
                    caption: 'First image',
                },
                {
                    image: 'image2.jpg',
                    durationSec: 2,
                    pan: 'none',
                    zoom: 'none',
                    caption: 'Second image',
                },
            ],
        };
        await fs.writeFile(path.join(inputDir, 'captions.json'), JSON.stringify(captionsJson, null, 2));
    });
    afterAll(async () => {
        // Clean up test files
        try {
            await fs.rm(testDir, { recursive: true, force: true });
        }
        catch (error) {
            // Ignore cleanup errors
        }
    });
    it('should assemble video from job directory', async () => {
        const runner = new JobRunner();
        // Mock ffmpeg to avoid actual video processing
        const mockFfmpeg = {
            createVideoFromImages: jest.fn().mockResolvedValue(undefined),
            addCaptions: jest.fn().mockResolvedValue(undefined),
            addWatermark: jest.fn().mockResolvedValue(undefined),
            checkAvailability: jest.fn().mockResolvedValue(true),
            getDuration: jest.fn().mockResolvedValue(4.0),
        };
        runner.ffmpeg = mockFfmpeg;
        // Mock fs.stat to return file info
        jest.spyOn(fs, 'stat').mockResolvedValue({
            size: 1024 * 1024, // 1MB
            isFile: () => true,
            isDirectory: () => false,
            isBlockDevice: () => false,
            isCharacterDevice: () => false,
            isSymbolicLink: () => false,
            isFIFO: () => false,
            isSocket: () => false,
            mtime: new Date(),
            ctime: new Date(),
            atime: new Date(),
            birthtime: new Date(),
            mode: 0o666,
            uid: 0,
            gid: 0,
            nlink: 1,
            dev: 0,
            ino: 0,
            rdev: 0,
            blksize: 4096,
            blocks: 0,
        });
        // Mock fs.mkdir and fs.rename
        jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
        jest.spyOn(fs, 'rename').mockResolvedValue(undefined);
        const result = await runner.runJob({
            inputDir,
            outputPath,
            watermark: false, // Disable to simplify test
        });
        expect(result).toBe(outputPath);
        expect(mockFfmpeg.createVideoFromImages).toHaveBeenCalled();
        expect(mockFfmpeg.addCaptions).toHaveBeenCalled();
        expect(mockFfmpeg.addWatermark).not.toHaveBeenCalled(); // Disabled
    }, 30000); // 30 second timeout for video processing
    it('should validate job configuration', async () => {
        const runner = new JobRunner();
        const job = await runner.loadJobConfig(inputDir);
        expect(job.platform).toBe('instagram_reel');
        expect(job.clips).toHaveLength(2);
        expect(job.clips[0].image).toBe('image1.jpg');
        expect(job.clips[0].durationSec).toBe(2);
        expect(job.clips[0].caption).toBe('First image');
    });
    it('should handle missing input files', async () => {
        const runner = new JobRunner();
        const invalidJob = {
            platform: 'instagram_reel',
            clips: [
                {
                    image: 'nonexistent.jpg',
                    durationSec: 2,
                },
            ],
        };
        // Temporarily replace captions.json
        const originalContent = await fs.readFile(path.join(inputDir, 'captions.json'), 'utf-8');
        await fs.writeFile(path.join(inputDir, 'captions.json'), JSON.stringify(invalidJob));
        try {
            await expect(runner.runJob({
                inputDir,
                outputPath: path.join(testDir, 'invalid.mp4'),
            })).rejects.toThrow('Missing input files');
        }
        finally {
            // Restore original content
            await fs.writeFile(path.join(inputDir, 'captions.json'), originalContent);
        }
    });
});
