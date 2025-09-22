#!/usr/bin/env node

import { Command } from 'commander';
import path from 'path';
import { JobRunner } from './jobRunner';
import { logger } from './logger';

const program = new Command();

program
  .name('vassemble')
  .description('Video assembler for marketing content')
  .version('1.0.0');

program
  .command('assemble')
  .description('Assemble video from job directory')
  .argument('<inputDir>', 'Input directory containing images and captions.json')
  .argument('<outputPath>', 'Output video file path')
  .option('-p, --profile <profile>', 'Output profile: reels, square, landscape', 'reels')
  .option('-b, --brand <brandPath>', 'Path to brand configuration YAML')
  .option('-w, --watermark', 'Enable watermark overlay', true)
  .option('--no-watermark', 'Disable watermark overlay')
  .option('-m, --music <musicPath>', 'Path to background music file')
  .option('-f, --fps <fps>', 'Frames per second', '30')
  .option('-r, --bitrate <bitrate>', 'Video bitrate (e.g., 2000k)', '2000k')
  .option('--ffmpeg <ffmpegPath>', 'Path to ffmpeg executable')
  .action(async (inputDir: string, outputPath: string, options: unknown) => {
    try {
      logger.info({ msg: 'Starting video assembly', inputDir, outputPath, options });

      const runner = new JobRunner(options.ffmpeg);

      const result = await runner.runJob({
        inputDir: path.resolve(inputDir),
        outputPath: path.resolve(outputPath),
        profile: options.profile,
        brandKit: options.brand ? path.resolve(options.brand) : undefined,
        watermark: options.watermark,
        music: options.music ? path.resolve(options.music) : undefined,
        fps: parseInt(options.fps),
        bitrate: options.bitrate,
      });

      logger.info({ msg: 'Video assembly completed', outputPath: result });
      console.log(`Video assembled successfully: ${result}`);

    } catch (error) {
      logger.error({ msg: 'Video assembly failed', error });
      console.error('Error:', error);
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate job configuration')
  .argument('<inputDir>', 'Input directory containing captions.json')
  .action(async (inputDir: string) => {
    try {
      const runner = new JobRunner();
      await runner.loadJobConfig(path.resolve(inputDir));
      console.log('Job configuration is valid');
    } catch (error) {
      console.error('Job configuration is invalid:', error);
      process.exit(1);
    }
  });

program
  .command('check-deps')
  .description('Check if required dependencies are available')
  .action(async () => {
    const runner = new JobRunner();
    let ffmpegAvailable = false;

    try {
      ffmpegAvailable = await runner.ffmpeg.checkAvailability();
      console.log(`FFmpeg available: ${ffmpegAvailable ? 'YES' : 'NO'}`);
    } catch (error) {
      console.log(`FFmpeg available: NO (${error})`);
    }

    process.exit(ffmpegAvailable ? 0 : 1);
  });

// Parse command line arguments
program.parse();