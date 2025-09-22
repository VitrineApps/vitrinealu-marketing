import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { generateForDir } from './generate.js';
import { logger } from './logger.js';

export function runCli() {
  const program = new Command();

  program
    .name('vcaption')
    .description('AI-powered social media caption generator for directories')
    .version('1.0.0');

  program
    .command('generate')
    .description('Generate captions for all media files in a directory')
    .requiredOption('-d, --media-dir <path>', 'Directory containing media files')
    .requiredOption('-p, --platform <platform>', 'Target platform (instagram|tiktok|youtube_shorts|linkedin|facebook)')
    .option('-o, --out-file <path>', 'Path to merged output JSON file (optional)')
    .option('--provider <provider>', 'AI provider (openai|gemini)', 'openai')
    .option('--model <model>', 'AI model to use')
    .option('--seed <number>', 'Random seed for deterministic output', parseInt)
    .option('--concurrency <number>', 'Number of concurrent requests', parseInt, 4)
    .action(async (options) => {
      try {
        // Validate platform
        const validPlatforms = ['instagram', 'tiktok', 'youtube_shorts', 'linkedin', 'facebook'];
        if (!validPlatforms.includes(options.platform)) {
          throw new Error(`Invalid platform. Must be one of: ${validPlatforms.join(', ')}`);
        }

        // Validate directory exists
        if (!fs.existsSync(options.mediaDir)) {
          throw new Error(`Media directory not found: ${options.mediaDir}`);
        }

        // Validate provider
        if (!['openai', 'gemini'].includes(options.provider)) {
          throw new Error(`Invalid provider. Must be one of: openai, gemini`);
        }

        console.log('🚀 Starting caption generation...');
        console.log(`📁 Media directory: ${options.mediaDir}`);
        console.log(`📱 Platform: ${options.platform}`);
        console.log(`🤖 Provider: ${options.provider}`);
        if (options.model) console.log(`🧠 Model: ${options.model}`);
        if (options.seed !== undefined) console.log(`🎲 Seed: ${options.seed}`);
        console.log(`⚡ Concurrency: ${options.concurrency}`);

        // Generate captions
        const results = await generateForDir({
          mediaDir: options.mediaDir,
          platform: options.platform,
          outFile: options.outFile,
          providerName: options.provider,
          model: options.model,
          seed: options.seed,
          concurrency: options.concurrency,
        });

        console.log(`\n🎉 Generated ${results.length} captions successfully!`);

        // Show summary
        if (results.length > 0) {
          console.log('\n📊 Summary:');
          results.forEach((result, index) => {
            const relativePath = path.relative(process.cwd(), path.resolve(options.mediaDir, result.meta.file));
            console.log(`${index + 1}. ${relativePath} → ${result.hashtags.length} hashtags`);
          });

          if (options.outFile) {
            console.log(`\n📄 Merged output saved to: ${options.outFile}`);
          }
        }

      } catch (error) {
        logger.error({ error }, 'CLI command failed');
        console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
      }
    });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error({ reason, promise }, 'Unhandled promise rejection');
    console.error('❌ Unhandled promise rejection:', reason);
    process.exitCode = 1;
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error({ error }, 'Uncaught exception');
    console.error('❌ Uncaught exception:', error);
    process.exitCode = 1;
  });

  program.parse();
}

// Run CLI
runCli();