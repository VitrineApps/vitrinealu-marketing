# Background Replacement Service

AI-powered background replacement for images using Stable Diffusion and RunwayML API.

## Setup

### Environment Variables

```bash
# For local Stable Diffusion
export RUNWAY_API_KEY=your_runway_api_key
export APP_WEBHOOK_SECRET=your_webhook_secret

# For Runway API only
export RUNWAY_API_KEY=your_runway_api_key
```

### Docker Setup

```bash
# Build and run with GPU support
docker build -t vitrinealu-background .
docker run --gpus all -p 3001:3001 vitrinealu-background
```

### Local Stable Diffusion Weights

Weights are automatically downloaded by Hugging Face diffusers on first run. No manual setup required.

### Runway API Setup

1. Sign up at [RunwayML](https://runwayml.com)
2. Get API key from dashboard
3. Set `RUNWAY_API_KEY` environment variable

## Usage

### CLI

```bash
# Basic usage
python -m services.background.cli --in input.jpg --out output.png --preset product-studio

# With custom prompt
python -m services.background.cli --in input.jpg --out output.png --prompt "clean white background"

# Using Runway API
python -m services.background.cli --in input.jpg --out output.png --engine runway
```

### API

```bash
# Enqueue background replacement job
curl -X POST http://localhost:3001/api/background/replace \
  -H "Content-Type: application/json" \
  -d '{
    "mediaId": "media-123",
    "inputPath": "/path/to/input.jpg",
    "projectId": "project-456",
    "preset": "product-studio",
    "callbackUrl": "https://your-app.com/webhooks/background"
  }'

# Response
{
  "jobId": "job-uuid-here"
}
```

### Webhook Callback

On completion, a POST request is sent to your `callbackUrl` with HMAC signature:

```bash
# Success callback
{
  "event": "background.job.succeeded",
  "jobId": "job-uuid",
  "mediaId": "media-123",
  "projectId": "project-456",
  "outputUrl": "https://storage.example.com/output.png",
  "timestamp": "2025-09-22T10:00:00Z"
}

# Failure callback
{
  "event": "background.job.failed",
  "jobId": "job-uuid",
  "mediaId": "media-123",
  "projectId": "project-456",
  "error": "Processing failed",
  "timestamp": "2025-09-22T10:00:00Z"
}
```

## Presets

See `services/background/presets.yaml` for available presets.

Common presets:
- `product-studio`: Clean white background for product photography
- `portrait-outdoor`: Natural outdoor background
- `minimalist`: Simple, clean backgrounds
- `studio-gradient`: Professional studio with gradient
- `nature-scene`: Natural environment backgrounds

## Orchestrator Integration

### JSON Workflow Example

```json
{
  "name": "Background Replacement",
  "nodes": [
    {
      "type": "background-replace",
      "parameters": {
        "mediaId": "{{mediaId}}",
        "inputPath": "{{inputPath}}",
        "preset": "product-studio",
        "overrides": {
          "prompt": "clean white background, professional lighting"
        }
      }
    }
  ]
}
```

### Result Format

```json
{
  "engine": "stable-diffusion",
  "preset": "product-studio",
  "seed": 42,
  "artifacts": {
    "output": "https://storage.example.com/background-replaced.png",
    "mask": "https://storage.example.com/mask.png"
  },
  "metrics": {
    "elapsed_ms": 15000
  }
}
```

## Examples

### Before/After

![Before](fixtures/background/input.jpg)
![After](fixtures/background/output-product-studio.jpg)

*Placeholder: Add actual before/after images*

### GIF Demonstrations

- Product photography: [product-studio.gif](fixtures/background/product-studio.gif)
- Portrait replacement: [portrait-outdoor.gif](fixtures/background/portrait-outdoor.gif)
- Minimalist backgrounds: [minimalist.gif](fixtures/background/minimalist.gif)

*Placeholder: Add actual GIF demonstrations*

## Troubleshooting

### Common Issues

1. **GPU Memory**: Reduce image size or use CPU mode
2. **API Limits**: Check RunwayML API quotas
3. **Webhook Timeouts**: Ensure callback URL is accessible

### Logs

Check worker logs for detailed error information:

```bash
docker logs vitrinealu-worker
```</content>
<parameter name="filePath">e:/my_projects/vitrinealu-marketing/docs/background-replacement.md