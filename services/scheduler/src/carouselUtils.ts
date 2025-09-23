import fs from 'fs';
import path from 'path';
import { CarouselDefinition } from './types.js';

/**
 * Recursively search for carousel.json files in a directory tree.
 * Returns an array of absolute file paths.
 */
export function findCarouselJsonFiles(rootDir: string): string[] {
  let results: string[] = [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findCarouselJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name === 'carousel.json') {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Parse a carousel.json file and return a CarouselDefinition.
 */
export function parseCarouselJson(filePath: string): CarouselDefinition {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw);
  // Basic validation
  if (!parsed.platform || !Array.isArray(parsed.items)) {
    throw new Error(`Invalid carousel.json at ${filePath}`);
  }
  return parsed as CarouselDefinition;
}
