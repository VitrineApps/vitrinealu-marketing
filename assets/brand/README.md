# Brand Assets

This directory contains brand assets used across the VitrineAlu marketing system.

## Watermark

The `watermark.png` file should be a transparent PNG image that will be overlaid on images and videos.

### Requirements

- **Format**: PNG with transparency
- **Recommended size**: 500x500px or larger (will be scaled automatically)
- **Aspect ratio**: Any (will be scaled maintaining proportions)
- **Transparency**: Alpha channel required for proper overlay

### Usage

The watermark is automatically applied by:

- **Media Ingest Service**: Watermarks curated images
- **Video Assembler**: Watermarks generated videos

### Configuration

Watermark settings are controlled by `config/brand.yaml`:

- `opacity`: Transparency level (0.0-1.0)
- `margin_px`: Margin from edges in pixels

### Adding Your Watermark

1. Create or obtain your brand watermark as a transparent PNG
2. Save it as `watermark.png` in this directory
3. Test with the media processing services

### Example

```bash
# Test watermark application
cd services/media_ingest
python -c "
from src.media_ingest.watermark import WatermarkApplier
from PIL import Image
import numpy as np

# Create test image
img = Image.fromarray(np.random.randint(0, 255, (1000, 1000, 3), dtype=np.uint8))
applier = WatermarkApplier()
result = applier.apply_watermark(img)
result.save('test_watermarked.jpg')
"
```

## Missing Watermark

If `watermark.png` is missing:

- Services will log a warning
- Processing will continue without watermarking
- No errors will be thrown
