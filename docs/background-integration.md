# Background Processing Integration Guide

This guide shows how to set up and use the complete background processing system with the media ingest pipeline.

## Components

1. **Background Service** (`services/background-service/`) - Python FastAPI service for AI background processing
2. **Background Client** (`packages/background-client/`) - TypeScript client library
3. **Media Ingest Integration** - Python integration in the media ingest pipeline
4. **N8N Automation** - Workflow for batch processing

## Setup

### 1. Start the Background Service

```bash
cd services/background-service
pip install -r requirements.txt
python run.py
```

The service will be available at `http://localhost:8089` with API docs at `/docs`.

### 2. Install Background Client Package

```bash
# In the workspace root
pnpm install
pnpm --filter @vitrinealu/background-client build
```

### 3. Configure Media Ingest

Update your media ingest `.env` file:

```bash
# Enable background automation
MEDIA_INGEST_BACKGROUND_AUTOMATION=replace  # or 'cleanup'
MEDIA_INGEST_BACKGROUND_API_URL=http://localhost:8089
MEDIA_INGEST_BACKGROUND_PRESET=vitrinealu
MEDIA_INGEST_BACKGROUND_PROMPT_TYPE=studio
```

### 4. Install N8N Workflow

1. Import `automation/n8n/background-batch.json` into your N8N instance
2. Configure the webhook URLs to match your API endpoints
3. Activate the workflow for weekly batch processing

## Usage Examples

### Manual Background Processing

#### Using the Python Client (in Media Ingest)

```python
from media_ingest.background_client import create_client, BGMode

client = create_client()

# Clean up background
result = client.cleanup(
    image_path="/path/to/image.jpg",
    mode=BGMode.TRANSPARENT,
    enhance_fg=True
)

# Replace background
result = client.replace(
    image_path="/path/to/image.jpg",
    prompt="modern minimalist studio with soft lighting",
    engine="SDXL"
)
```

#### Using the TypeScript Client

```typescript
import { createClient, brandPresets } from '@vitrinealu/background-client';

const client = createClient();

// Clean up background
const cleanupResult = await client.cleanup({
  imagePath: '/path/to/image.jpg',
  mode: 'transparent',
  enhanceFg: true
});

// Replace background with brand preset
const replaceResult = await client.replace({
  imagePath: '/path/to/image.jpg',
  prompt: brandPresets.vitrinealu.prompts.studio,
  negativePrompt: brandPresets.vitrinealu.negativePrompt,
  engine: 'SDXL'
});
```

### Automated Processing

#### Media Ingest Pipeline

When `BACKGROUND_AUTOMATION` is enabled, the media ingest pipeline will automatically:

1. Process images through the normal curation pipeline
2. Send curated images to the background service
3. Update sidecar JSON with background processing metadata
4. Continue with normal watermarking and output

Example sidecar JSON with background processing:

```json
{
  "source": "gdrive",
  "original_path": "/path/to/original.jpg",
  "output_path": "/media/curated/2024/01/sample.jpg",
  "processed_at": "2024-01-15T10:30:00Z",
  "scores": {
    "aesthetic": 0.85,
    "sharpness": 245.67
  },
  "decisions": {
    "kept": true,
    "reasons": []
  },
  "enhancement": {
    "backend": "realesrgan",
    "scale": 2
  },
  "background": {
    "mode": "replace",
    "engine": "SDXL",
    "outJpg": "/output/background_replaced.jpg",
    "processedAt": "2024-01-15T10:32:00Z",
    "prompt": "modern minimalist studio with soft diffused lighting",
    "settings": {
      "steps": 25,
      "guidanceScale": 7.5,
      "enhanceFg": true,
      "matchColors": true,
      "featherEdges": true
    }
  },
  "faces_blurred": true,
  "watermark": "/path/to/logo.png",
  "brand": "vitrinealu"
}
```

#### N8N Batch Processing

The N8N workflow runs weekly and:

1. Fetches all curated media from the API
2. Processes them in batches of 5
3. Sends each image to the background service
4. Updates media records with results
5. Logs progress and completion

## Configuration Options

### Background Service

Environment variables for the background service:

```bash
BG_ENGINE=SDXL          # or RUNWAY
DEVICE=cuda             # or cpu
OUTPUT_DIR=./output
MODEL_ID=stabilityai/stable-diffusion-xl-base-1.0
RUNWAY_API_KEY=your_key # if using Runway
DEBUG=false
```

### Media Ingest Integration

```bash
MEDIA_INGEST_BACKGROUND_AUTOMATION=replace  # cleanup, replace, or empty
MEDIA_INGEST_BACKGROUND_API_URL=http://localhost:8089
MEDIA_INGEST_BACKGROUND_PRESET=vitrinealu
MEDIA_INGEST_BACKGROUND_PROMPT_TYPE=studio  # garden, studio, minimal, lifestyle
```

### TypeScript Client

```bash
BACKGROUND_API_URL=http://localhost:8089
BACKGROUND_TIMEOUT=300000
BACKGROUND_RETRY_ATTEMPTS=3
BACKGROUND_RETRY_DELAY=1000
```

## Monitoring and Troubleshooting

### Health Checks

```bash
# Check background service health
curl http://localhost:8089/health

# Check with TypeScript client
import { createClient } from '@vitrinealu/background-client';
const client = createClient();
const isHealthy = await client.isHealthy();
```

### Logs

- Background service logs: `services/background-service/logs/`
- Media ingest logs: `services/media_ingest/logs/media_ingest.log`
- N8N workflow logs: Available in N8N interface

### Common Issues

1. **Service Unavailable**: Check if background service is running on port 8089
2. **GPU Memory Issues**: Reduce batch size or switch to CPU mode
3. **Timeout Errors**: Increase timeout settings for large images
4. **API Rate Limits**: If using Runway, check your API quotas

## Testing

### Unit Tests

```bash
# Test TypeScript client
cd packages/background-client
pnpm test

# Test media ingest integration
cd services/media_ingest
pytest tests/test_background_integration.py
```

### Integration Testing

```bash
# Test full pipeline with background processing
MEDIA_INGEST_BACKGROUND_AUTOMATION=cleanup pytest tests/test_integration.py
```

## Performance Considerations

- **SDXL Local**: Requires GPU with 8GB+ VRAM, ~20-30 seconds per image
- **Runway Cloud**: Faster API responses but requires internet and API credits
- **Batch Size**: Process 5-10 images concurrently for optimal performance
- **Storage**: Generated images are ~2-5MB each, plan storage accordingly

## License

Internal use only - VitrineAlu Marketing