# Video API Service

Production-ready Express API for video assembly orchestration using FFmpeg with BullMQ job queue.

## Features

- **9:16 Reel Videos**: Optimized for TikTok/Instagram Reels/YouTube Shorts
- **16:9 LinkedIn Videos**: Professional format for LinkedIn content
- **Ken Burns Effects**: Dynamic pan and zoom animations
- **Brand Integration**: Watermarks and visual identity
- **Caption Overlays**: ASS subtitle format support
- **Audio Processing**: LUFS normalization and audio beds
- **Job Queue**: Redis-backed BullMQ for scalable processing
- **Rate Limiting**: Protection against abuse
- **Structured Logging**: Pino logger with request tracking

## API Endpoints

### POST /video/reel

Create a 9:16 aspect ratio video for Reels/TikTok/Shorts.

**Request Body:**
```json
{
  "mediaDir": "/path/to/images",
  "outDir": "/path/to/output",
  "brandPath": "/path/to/brand.yaml",
  "musicPath": "/path/to/audio.mp3",
  "captionSidecarPlatform": "tiktok",
  "seed": 42,
  "clips": [
    {
      "image": "image1.jpg",
      "durationSec": 3,
      "pan": "left-to-right",
      "zoom": "in"
    }
  ]
}
```

**Response:**
```json
{
  "jobId": "video:reel:abc123",
  "outPath": "/path/to/output/2024/01/reel_xyz.mp4",
  "status": "queued",
  "estimatedDuration": 15,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### POST /video/linkedin

Create a 16:9 aspect ratio video for LinkedIn.

**Request Body:**
```json
{
  "mediaDir": "/path/to/images",
  "outDir": "/path/to/output", 
  "brandPath": "/path/to/brand.yaml",
  "musicPath": "/path/to/audio.mp3",
  "captionSidecarPlatform": "linkedin",
  "seed": 42
}
```

**Response:**
```json
{
  "jobId": "video:linkedin:def456",
  "outPath": "/path/to/output/2024/01/linkedin_xyz.mp4",
  "status": "queued",
  "estimatedDuration": 20,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### GET /video/health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "service": "video-api",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0"
}
```

## Request Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mediaDir` | string | Yes | Directory containing source images |
| `outDir` | string | Yes | Output directory for rendered video |
| `brandPath` | string | No | Path to brand configuration YAML |
| `musicPath` | string | No | Path to background music file |
| `captionSidecarPlatform` | string | No | Platform for caption sidecar (`tiktok`, `linkedin`, etc.) |
| `seed` | number | No | Random seed for reproducible effects (default: 42) |
| `clips` | array | No | Manual clip configuration (auto-discovers if not provided) |

### Clip Configuration

| Field | Type | Description |
|-------|------|-------------|
| `image` | string | Image filename (relative to mediaDir) |
| `durationSec` | number | Duration in seconds (default: 3 for reels, 4 for LinkedIn) |
| `pan` | string | Pan direction: `left-to-right`, `right-to-left`, `top-to-bottom`, `bottom-to-top`, `center` |
| `zoom` | string | Zoom type: `in`, `out`, `none` |

## Environment Variables

```bash
# Server Configuration
PORT=3000

# Redis Configuration (Required)
REDIS_URL=redis://localhost:6379
REDIS_MAX_RETRIES=3

# File System
UPLOADS_DIR=./uploads
OUTPUT_DIR=./media/videos
MAX_FILE_SIZE=104857600  # 100MB

# Rate Limiting
RATE_WINDOW_MS=900000    # 15 minutes
RATE_MAX=100             # requests per window

# Queue Configuration
QUEUE_CONCURRENCY=2
QUEUE_MAX_ATTEMPTS=3
QUEUE_BACKOFF_DELAY=5000

# FFmpeg (Optional)
FFMPEG_PATH=/usr/bin/ffmpeg
```

## Usage Examples

### Create a Reel with Auto-Discovery

```bash
curl -X POST http://localhost:3000/video/reel \\
  -H "Content-Type: application/json" \\
  -d '{
    "mediaDir": "/home/user/images",
    "outDir": "/home/user/videos",
    "brandPath": "/home/user/brand.yaml",
    "musicPath": "/home/user/audio.mp3",
    "captionSidecarPlatform": "tiktok"
  }'
```

### Create a LinkedIn Video with Custom Clips

```bash
curl -X POST http://localhost:3000/video/linkedin \\
  -H "Content-Type: application/json" \\
  -d '{
    "mediaDir": "/home/user/images",
    "outDir": "/home/user/videos",
    "clips": [
      {
        "image": "intro.jpg",
        "durationSec": 5,
        "pan": "center",
        "zoom": "in"
      },
      {
        "image": "product.jpg", 
        "durationSec": 4,
        "pan": "left-to-right",
        "zoom": "out"
      }
    ]
  }'
```

## Error Responses

All error responses follow this format:

```json
{
  "error": "Error Type",
  "message": "Detailed error message",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "path": "/video/reel",
  "statusCode": 400
}
```

### Common Error Codes

- **400 Bad Request**: Invalid request parameters or missing media
- **404 Not Found**: Route not found
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: Server processing error

## Output Format

Videos are saved with the following characteristics:

### Reel Format (9:16)
- **Resolution**: 1080x1920
- **Bitrate**: 10-14 Mb/s (VBR)
- **Audio**: AAC 128kbps, -23 LUFS
- **Codec**: H.264 (libx264)
- **Profile**: Main, Level 4.2

### LinkedIn Format (16:9)
- **Resolution**: 1920x1080
- **Bitrate**: 8-12 Mb/s (VBR)
- **Audio**: AAC 128kbps, -23 LUFS
- **Codec**: H.264 (libx264)
- **Profile**: Main, Level 4.2

## File Organization

Output files are organized by date:

```
/output/dir/
├── 2024/
│   ├── 01/
│   │   ├── reel_abc123_xyz.mp4
│   │   └── linkedin_def456_xyz.mp4
│   └── 02/
│       └── reel_ghi789_xyz.mp4
```

## Development

### Setup

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start
```

### Testing

```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Type checking
pnpm type-check

# Linting
pnpm lint
pnpm lint:fix
```

## Dependencies

- **Express.js**: Web framework
- **BullMQ**: Redis-based job queue
- **FFmpeg**: Video processing (via fluent-ffmpeg)
- **Zod**: Request validation
- **Pino**: Structured logging
- **Helmet**: Security middleware
- **CORS**: Cross-origin resource sharing

## Queue Processing

Jobs are processed asynchronously using BullMQ with Redis backend:

1. API receives request and validates input
2. Job is queued with unique ID
3. Worker processes job using video-assembler package  
4. Progress updates are tracked in Redis
5. Completed videos are saved to configured output directory

## Security Features

- **Rate Limiting**: 10 requests per 15 minutes per IP
- **Helmet**: Security headers
- **CORS**: Configurable origin restrictions
- **Input Validation**: Zod schema validation
- **File Size Limits**: 100MB default limit
- **Path Traversal Protection**: Validated file paths

## Monitoring

The service provides structured logging for:

- HTTP requests (method, URL, status, duration)
- Job queue events (queued, processing, completed, failed)
- Error tracking with stack traces
- Performance metrics

## Architecture

```
Client Request
     ↓
Express Router
     ↓
Validation Middleware
     ↓
Controller Logic
     ↓
BullMQ Job Queue
     ↓
Video Assembler Worker
     ↓
FFmpeg Processing
     ↓
Output File
```