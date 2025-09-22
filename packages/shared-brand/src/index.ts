import { z } from 'zod';
import { readFileSync } from 'fs';
import { load as loadYaml } from 'js-yaml';
import { join, resolve } from 'path';

// Hex color validation regex
const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;

// Brand configuration schema
export const BrandConfigSchema = z.object({
  brand: z.string(),
  tagline: z.string(),
  colors: z.object({
    primary: z.string().regex(hexColorRegex, 'Must be a valid hex color (e.g. #FF0000)'),
    secondary: z.string().regex(hexColorRegex, 'Must be a valid hex color (e.g. #FF0000)'),
    accent: z.string().regex(hexColorRegex, 'Must be a valid hex color (e.g. #FF0000)'),
    text_light: z.string().regex(hexColorRegex, 'Must be a valid hex color (e.g. #FF0000)'),
    text_dark: z.string().regex(hexColorRegex, 'Must be a valid hex color (e.g. #FF0000)'),
  }),
  fonts: z.object({
    primary: z.string(),
    secondary: z.string(),
  }),
  watermark: z.object({
    path: z.string(),
    opacity: z.number().min(0).max(1),
    margin_px: z.number().int().positive(),
  }),
  aspect_ratios: z.object({
    reels: z.string(),
    square: z.string(),
    landscape: z.string(),
  }),
  safe_areas: z.object({
    reels: z.object({
      top: z.number().int().nonnegative(),
      bottom: z.number().int().nonnegative(),
      left: z.number().int().nonnegative(),
      right: z.number().int().nonnegative(),
    }),
  }),
});

export type BrandConfig = z.infer<typeof BrandConfigSchema>;

/**
 * Load brand configuration from YAML file
 * @param configPath - Path to the brand.yaml file (defaults to config/brand.yaml relative to cwd)
 * @returns Validated brand configuration
 */
export function loadBrandConfig(configPath?: string): BrandConfig {
  const defaultPath = join(process.cwd(), 'config', 'brand.yaml');
  const resolvedPath = configPath ? resolve(configPath) : defaultPath;

  try {
    const yamlContent = readFileSync(resolvedPath, 'utf-8');
    const parsed = loadYaml(yamlContent) as unknown;
    return BrandConfigSchema.parse(parsed);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load brand config from ${resolvedPath}: ${error.message}`);
    }
    throw new Error(`Failed to load brand config from ${resolvedPath}`);
  }
}

/**
 * Get the default brand configuration
 * @returns The default brand configuration
 */
export function getDefaultBrandConfig(): BrandConfig {
  return loadBrandConfig();
}