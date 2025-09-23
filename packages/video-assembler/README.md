# Video Assembler

A TypeScript package for assembling marketing videos from images with captions, watermarks, and Ken Burns effects using FFmpeg or third-party APIs.

## Features

- **Pluggable Adapters**: Support for FFmpeg, CapCut, and Runway video generation
- **Automatic Fallback**: Graceful fallback between adapters when APIs fail
- **Ken Burns Effects**: Smooth zoom and pan effects on images
- **Caption Overlay**: SRT/ASS subtitle support with safe area calculations
- **Watermarking**: PNG/SVG watermark overlay with scaling and positioning
- **Brand Kit Support**: YAML-based brand configuration with font resolution
- **CLI Tool**: Command-line interface for easy video assembly
- **TypeScript**: Full type safety with Zod validation
- **FFmpeg Integration**: Leverages fluent-ffmpeg for robust video processing

## Installation

```bash
pnpm add @vitrinealu/video-assembler
```

## Requirements

- Node.js 18+
- FFmpeg installed on system PATH (for FFmpeg adapter)
- TypeScript 5+

## Video Generation Adapters

The package supports multiple video generation adapters that can be used interchangeably:

### Available Adapters

1. **FFmpeg Adapter** (`ffmpeg`) - Default, local video processing
   - Requires FFmpeg installation
   - Full control over video processing
   - No API limits or costs

2. **CapCut Adapter** (`capcut`) - Template-based video generation
   - Uses CapCut's Commercial API
   - Template-based rendering with slot replacement
   - Requires `CAPCUT_API_KEY` and `CAPCUT_TEMPLATE_ID`

3. **Runway Adapter** (`runway`) - AI-powered video generation
   - Uses Runway's Gen-3 Alpha Turbo model
   - AI video generation from image sequences
   - Requires `RUNWAY_API_KEY`


### Environment Configuration

Configure adapters using environment variables:

```bash
# Adapter selection (default: ffmpeg)
# Adapter selection (default: ffmpeg)
VIDEO_ADAPTER=capcut

# Enable/disable fallback between adapters (default: true)
VIDEO_ADAPTER_FALLBACK=true

# --- Operational Hardening Knobs ---
# Max concurrent video jobs (default: 2)
VIDEO_MAX_CONCURRENCY=2
# Per-job timeout in ms (default: 600000)
VIDEO_JOB_TIMEOUT_MS=600000

# CapCut configuration
## Operational Guidance

- **Concurrency Guard**: The assembler enforces a semaphore limiting concurrent jobs to `VIDEO_MAX_CONCURRENCY` (default 2).
- **Timeouts**: Each job is killed if it exceeds `VIDEO_JOB_TIMEOUT_MS` (default 10min).
- **Metrics**: Structured metrics are emitted after each job: `{ adapter, profile, durationSec, wallMs, retries }` for monitoring and cost control.
CAPCUT_API_KEY=your_capcut_api_key
CAPCUT_TEMPLATE_ID=your_template_id
CAPCUT_BASE_URL=https://api.capcut.com  # Optional

# Runway configuration  
RUNWAY_API_KEY=your_runway_api_key
RUNWAY_BASE_URL=https://api.runwayml.com  # Optional
RUNWAY_MODEL=gen-3a-turbo  # Optional
```

### Fallback Behavior

When `VIDEO_ADAPTER_FALLBACK=true` (default), the system will try adapters in this order:

1. Specified adapter (or CapCut if none specified)
2. Runway (if CapCut fails)
3. FFmpeg (if all others fail)

This ensures video generation always succeeds when FFmpeg is available.

## CLI Usage

The package provides a `vassemble` command for video assembly:

```bash
# Assemble video from job directory
vassemble assemble /path/to/job/directory /path/to/output.mp4

# Validate job configuration
vassemble validate /path/to/job/directory

# Check FFmpeg availability
vassemble check-deps
```

## Job Directory Structure

```text
job-directory/
├── captions.json    # Job configuration
├── image1.jpg       # Source images
├── image2.jpg
└── audio.mp3        # Optional background audio
```

## Job Configuration (captions.json)

```json
{
  "platform": "instagram_reel",
  "clips": [
    {
      "image": "image1.jpg",
      "durationSec": 3,
      "pan": "left",
      "zoom": "slow",
      "caption": "Beautiful sunset over the mountains"
    },
    {
      "image": "image2.jpg",
      "durationSec": 2,
      "pan": "none",
      "zoom": "none",
      "caption": "Perfect for your next adventure"
    }
  ],
  "output": {
    "width": 1080,
    "height": 1920,
    "fps": 30,
    "format": "mp4"
  }
}
```

## Brand Kit Configuration

Create a `brand-kit.yaml` file for consistent branding:

```yaml
fonts:
  primary: "Arial-Bold"
  secondary: "Arial"
  fallback: "sans-serif"

colors:
  primary: "#FF6B35"
  secondary: "#F7931E"
  text: "#FFFFFF"

watermark:
  path: "logo.png"
  position: "bottom-right"
  opacity: 0.8
  scale: 0.1
```

## Programmatic Usage

### Using the Adapter System

```typescript
import { createAdapterFactoryFromEnv, AdapterFactory } from '@vitrinealu/video-assembler';

// Create factory from environment variables
const factory = createAdapterFactoryFromEnv();

// Generate video with specific adapter
const job = {
  profile: 'reel',
  clips: [
    { image: 'image1.jpg', durationSec: 3 },
    { image: 'image2.jpg', durationSec: 3 },
  ],
  outPath: '/tmp/output.mp4',
  seed: 42,
};

// Use specific adapter
const result = await factory.generateVideo(job, 'capcut', true);
console.log(`Video generated with ${result.adapter}: ${result.outPath}`);

// Check available adapters
const available = await factory.getAvailableAdapters();
console.log('Available adapters:', available);
```

### Manual Adapter Configuration

```typescript
import { AdapterFactory, CapCutAdapter, RunwayAdapter, FFmpegAdapter } from '@vitrinealu/video-assembler';

const factory = new AdapterFactory({
  defaultAdapter: 'ffmpeg',
  fallbackOrder: ['capcut', 'runway', 'ffmpeg'],
  enableFallback: true,
  capcut: {
    apiKey: 'your-api-key',
    templateId: 'template-123',
    baseUrl: 'https://api.capcut.com',
    maxPollAttempts: 30,
    pollIntervalMs: 2000,
  },
  runway: {
    apiKey: 'your-runway-key',
    baseUrl: 'https://api.runwayml.com',
    model: 'gen-3a-turbo',
    maxPollAttempts: 60,
    pollIntervalMs: 3000,
  },
});
```

### Legacy CLI Interface

```typescript
import { JobRunner } from '@vitrinealu/video-assembler';

const runner = new JobRunner();

await runner.runJob({
  inputDir: '/path/to/job',
  outputPath: '/path/to/output.mp4',
  brandKit: '/path/to/brand-kit.yaml',
  watermark: true,
  audio: '/path/to/audio.mp3'
});
```

## Supported Platforms

- `instagram_reel` (9:16, 1080x1920)
- `instagram_story` (9:16, 1080x1920)
- `tiktok` (9:16, 1080x1920)
- `youtube_short` (9:16, 1080x1920)
- `linkedin` (1:1, 1080x1080)
- `facebook` (16:9, 1920x1080)

## Ken Burns Effects

### Zoom Options

- `none`: No zoom
- `slow`: Gradual zoom in
- `fast`: Quick zoom in
- `zoom_out_slow`: Gradual zoom out
- `zoom_out_fast`: Quick zoom out

### Pan Options

- `none`: No pan
- `left`: Pan left
- `right`: Pan right
- `up`: Pan up
- `down`: Pan down

## Caption Safe Areas

Captions are automatically positioned within safe areas to avoid being cut off:

- **Top Safe Area**: 10% from top
- **Bottom Safe Area**: 15% from bottom (accounts for mobile UI)
- **Side Margins**: 5% from left/right edges

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Build package
pnpm build

# Run linter
pnpm lint
```

## Testing

The package includes comprehensive unit and integration tests:

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run in watch mode
pnpm test:watch
```

## License

UNLICENSED
