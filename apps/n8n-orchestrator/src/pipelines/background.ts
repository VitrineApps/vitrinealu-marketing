import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import * as YAML from 'yaml';
import pino from 'pino';
import { createClient } from '@supabase/supabase-js';
import { BackgroundConfigSchema, BackgroundResultSchema, BackgroundJob, BackgroundResult } from '../types/background.js';

const logger = pino({ level: 'info' });
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

const configPath = join(process.cwd(), 'src/config/background.yml');
const config = BackgroundConfigSchema.parse(YAML.parse(readFileSync(configPath, 'utf8')));

function choosePreset(job: BackgroundJob): string | null {
  if (!config.presets_enabled) return null;

  // Check routing rules
  for (const rule of config.routing_rules) {
    const { condition, preset } = rule;
    if (condition.tags && condition.tags.some(tag => job.tags.includes(tag))) {
      return preset;
    }
    if (condition.product && job.product === condition.product) {
      return preset;
    }
  }

  // Fallback to first allowed preset
  return config.allowed_presets[0] || null;
}

export async function runBackgroundTask(job: BackgroundJob): Promise<BackgroundResult | null> {
  const childLogger = logger.child({ scope: 'pipelines.background', mediaId: job.mediaId });

  // Idempotency check
  if (existsSync(job.outputPath)) {
    const existing = await supabase
      .from('media_background_edits')
      .select('output_path')
      .eq('media_id', job.mediaId)
      .single();
    if (existing.data?.output_path === job.outputPath) {
      childLogger.info('Skipping idempotent background task');
      return null;
    }
  }

  const preset = choosePreset(job);
  if (!preset) {
    childLogger.warn('No preset available for job');
    return null;
  }

  const args = [
    '-m', 'services.background.cli',
    '--in', job.inputPath,
    '--out', job.outputPath,
    '--preset', preset,
  ];

  if (config.default_engine !== 'diffusion') {
    args.push('--engine', config.default_engine);
  }

  childLogger.info({ args }, 'Spawning background replacement process');

  const result = await new Promise<BackgroundResult>((resolve, reject) => {
    const proc = spawn('python', args, { stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
      childLogger.info({ output: data.toString().trim() }, 'Background process stdout');
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      childLogger.error({ error: data.toString().trim() }, 'Background process stderr');
    });

    proc.on('close', (code) => {
      if (code === 0) {
        try {
          const result = BackgroundResultSchema.parse(JSON.parse(stdout.trim()));
          resolve(result);
        } catch (e) {
          reject(new Error(`Invalid JSON output: ${stdout}`));
        }
      } else {
        reject(new Error(`Process exited with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', reject);
  });

  // Persist to DB
  await supabase.from('media_background_edits').insert({
    media_id: job.mediaId,
    engine: result.engine,
    preset: result.preset,
    seed: result.seed,
    output_path: result.artifacts.output,
    mask_path: result.artifacts.mask,
    elapsed_ms: result.metrics.elapsed_ms,
    status: 'completed',
  });

  childLogger.info({ result }, 'Background task completed');
  return result;
}