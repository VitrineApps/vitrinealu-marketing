#!/usr/bin/env tsx

import { loadBrandConfig } from '../packages/shared-brand/src/index.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

async function main() {
  try {
    console.log('🔍 Validating brand configuration...');

    const brandConfig = await loadBrandConfig(path.join(rootDir, 'config', 'brand.yaml'));

    console.log('✅ Brand config loaded successfully');
    console.log(`📊 Brand: ${brandConfig.brand}`);
    console.log(`🎨 Primary color: ${brandConfig.colors.primary}`);
    console.log(`🔤 Font: ${brandConfig.fonts.primary}`);
    console.log(`📐 Aspect ratio: ${brandConfig.aspect_ratios.reels}`);
    console.log(`🛡️ Safe area: ${brandConfig.safe_areas.reels.top}px top, ${brandConfig.safe_areas.reels.bottom}px bottom`);

    if (brandConfig.watermark) {
      console.log(`💧 Watermark: ${(brandConfig.watermark.opacity * 100).toFixed(0)}% opacity`);
    }

    console.log('🎉 Brand configuration is valid!');
  } catch (error) {
    console.error('❌ Brand config validation failed:', error);
    process.exit(1);
  }
}

main();