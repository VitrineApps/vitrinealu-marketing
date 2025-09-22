#!/usr/bin/env python3

import sys
import os
from pathlib import Path

# Add the services/media_ingest/src to the path so we can import the brand_loader
sys.path.insert(0, str(Path(__file__).parent.parent / 'services' / 'media_ingest' / 'src'))

from media_ingest.brand_loader import load_brand_config

def main():
    try:
        print("🔍 Validating brand configuration (Python)...")

        root_dir = Path(__file__).parent.parent
        config_path = root_dir / 'config' / 'brand.yaml'

        brand_config = load_brand_config(str(config_path))

        print("✅ Brand config loaded successfully")
        print(f"📊 Brand: {brand_config.brand}")
        print(f"🎨 Primary color: {brand_config.colors.primary}")
        print(f"🔤 Font: {brand_config.fonts.primary}")
        print(f"📐 Aspect ratio: {brand_config.aspect_ratios.reels}")
        print(f"🛡️ Safe area: {brand_config.safe_areas.reels.top}px top, {brand_config.safe_areas.reels.bottom}px bottom")

        if brand_config.watermark:
            print(f"💧 Watermark: {int(brand_config.watermark.opacity * 100)}% opacity")

        print("🎉 Brand configuration is valid!")

    except Exception as error:
        print(f"❌ Brand config validation failed: {error}")
        sys.exit(1)

if __name__ == "__main__":
    main()