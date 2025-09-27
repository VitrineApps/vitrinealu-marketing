import fs from 'node:fs/promises';
import path from 'node:path';
import glob from 'fast-glob';
import Database from 'better-sqlite3';
import * as yaml from 'js-yaml';
import { env } from '../config.js';
import { logger } from '@vitrinealu/shared/logger';

export interface IngestFile {
  path: string;
  size: number;
  mtimeMs: number;
}

interface IngestConfig {
  ingest: {
    local_source: string;
    glob: string;
    min_bytes: number;
    ignore_hidden: boolean;
  };
}

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    const dbPath = path.join(process.cwd(), 'ingest.db');
    db = new Database(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS ingest_seen (
        path TEXT PRIMARY KEY,
        mtime_ms BIGINT NOT NULL
      )
    `);
  }
  return db;
}

export async function resolveInputRoot(): Promise<string> {
  // First try env var
  if (env.LOCAL_INPUT_DIR) {
    return env.LOCAL_INPUT_DIR;
  }

  // Fallback to config file
  try {
    const configPath = path.join(process.cwd(), '..', '..', 'config', 'ingest.yaml');
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config = yaml.load(configContent) as IngestConfig;
    return config.ingest.local_source;
  } catch (err) {
    logger.error({ err }, 'Failed to load ingest config');
    throw new Error('Could not resolve input root');
  }
}

export async function listNewFiles(globPattern?: string): Promise<IngestFile[]> {
  const inputRoot = await resolveInputRoot();
  const pattern = globPattern || '**/*.{jpg,jpeg,png,webp}';

  const files = await glob(pattern, {
    cwd: inputRoot,
    absolute: true,
    onlyFiles: true,
    stats: true
  });

  const ingestFiles: IngestFile[] = [];
  const dbInstance = getDb();
  const seenStmt = dbInstance.prepare('SELECT mtime_ms FROM ingest_seen WHERE path = ?');

  for (const file of files) {
    const filePath = file.path;
    const stat = await fs.stat(filePath);

    // Filter by min size
    if (stat.size < 50000) continue;

    // Filter hidden files
    if (path.basename(filePath).startsWith('.')) continue;

    // Check if seen
    const seen = seenStmt.get(filePath) as { mtime_ms: number } | undefined;
    if (seen && seen.mtime_ms >= stat.mtimeMs) continue;

    ingestFiles.push({
      path: filePath,
      size: stat.size,
      mtimeMs: stat.mtimeMs
    });
  }

  return ingestFiles;
}

export async function markSeen(files: IngestFile[]): Promise<void> {
  const dbInstance = getDb();
  const insertStmt = dbInstance.prepare('INSERT OR REPLACE INTO ingest_seen (path, mtime_ms) VALUES (?, ?)');

  const insertMany = dbInstance.transaction((files: IngestFile[]) => {
    for (const file of files) {
      insertStmt.run(file.path, file.mtimeMs);
    }
  });

  insertMany(files);
}