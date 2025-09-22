# Video Assembler

A TypeScript package for assembling marketing videos from images with captions, watermarks, and Ken Burns effects using FFmpeg.

## Features

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
- FFmpeg installed on system PATH
- TypeScript 5+

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

```
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
