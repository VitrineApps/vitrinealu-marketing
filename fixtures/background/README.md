# Sample Input Images for Background Replacement

This directory contains sample input images for testing the background replacement service.

## Available Samples

- `input.jpg.placeholder` - Generic product image placeholder
- `portrait.jpg.placeholder` - Portrait photo placeholder
- `product.jpg.placeholder` - Product photography placeholder
- `object.jpg.placeholder` - Object on plain background placeholder

## Usage

Replace these .placeholder files with actual JPEG images to test the service.

Example API usage:

```bash
curl -X POST http://localhost:3000/api/background/replace \
  -F "image=@fixtures/background/product.jpg" \
  -F "preset=product-studio" \
  -F "webhook_url=https://your-app.com/webhook"
```

## Preset Recommendations

- `product.jpg`: Use with `product-studio` or `minimalist` presets
- `portrait.jpg`: Use with `portrait-outdoor` or `nature-scene` presets
- `object.jpg`: Use with any preset depending on desired background
