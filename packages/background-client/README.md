# @vitrinealu/background-client

TypeScript client for the VitrineAlu background processing service. Provides methods for image background cleanup and AI-powered background replacement.

## Features

- **Background Cleanup**: Remove or soften image backgrounds
- **Background Replacement**: AI-generated backgrounds using SDXL or Runway ML
- **Retry Logic**: Automatic retries with exponential backoff using p-retry
- **Type Safety**: Full TypeScript support with Zod validation
- **Logging**: Structured logging with pino
- **Brand Presets**: Pre-configured prompts for consistent brand aesthetics

## Installation

```bash
pnpm add @vitrinealu/background-client
```

## Configuration

Configure the client using environment variables:

```bash
# Background service URL
BACKGROUND_API_URL=http://localhost:8089

# Request timeout (default: 300000ms = 5 minutes)
BACKGROUND_TIMEOUT=300000

# Retry configuration
BACKGROUND_RETRY_ATTEMPTS=3
BACKGROUND_RETRY_DELAY=1000
```

## Usage

### Basic Setup

```typescript
import { createClient, BackgroundClient } from '@vitrinealu/background-client';

// Create client with environment configuration
const client = createClient();

// Or with custom configuration
const client = createClient({
  baseUrl: 'http://localhost:8089',
  timeout: 60000,
  retryAttempts: 5
});
```

### Background Cleanup

Remove or soften image backgrounds while preserving the foreground object:

```typescript
// Transparent background removal
const result = await client.cleanup({
  imagePath: '/path/to/product.jpg',
  mode: 'transparent',
  enhanceFg: true,
  denoise: false
});

// Soften background
const result = await client.cleanup({
  imagePath: '/path/to/product.jpg',
  mode: 'soften',
  blurRadius: 15,
  desaturatePct: 50,
  enhanceFg: true
});

console.log('Cleaned image:', result.outJpg);
```

### Background Replacement

Replace backgrounds with AI-generated content:

```typescript
// Basic replacement
const result = await client.replace({
  imagePath: '/path/to/product.jpg',
  prompt: 'modern minimalist studio with soft lighting',
  negativePrompt: 'people, text, watermark, cluttered',
  steps: 25,
  guidanceScale: 7.5,
  engine: 'SDXL'
});

// With seed for reproducible results
const result = await client.replace({
  imagePath: '/path/to/product.jpg',
  prompt: 'beautiful garden background with natural lighting',
  seed: 42,
  engine: 'RUNWAY'
});

console.log('Replaced image:', result.outJpg);
console.log('Used prompt:', result.prompt);
```

### Brand Presets

Use pre-configured brand presets for consistent results:

```typescript
import { brandPresets } from '@vitrinealu/background-client';

// Get VitrineAlu brand preset
const preset = brandPresets.vitrinealu;

// Use preset prompts
const result = await client.replace({
  imagePath: '/path/to/product.jpg',
  prompt: preset.prompts.studio,
  negativePrompt: preset.negativePrompt,
  steps: preset.settings.steps,
  guidanceScale: preset.settings.guidanceScale,
  engine: preset.settings.engine
});
```

Available prompt types:
- `garden`: Modern minimalist garden settings
- `studio`: Professional photography studio
- `minimal`: Clean minimalist backgrounds
- `lifestyle`: Modern living spaces

### Health Checks

Check service availability:

```typescript
// Simple health check
const isHealthy = await client.isHealthy();
console.log('Service healthy:', isHealthy);

// Detailed status
const status = await client.getStatus();
console.log('Service status:', status);
// { status: 'healthy', engine: 'SDXL', device: 'cuda' }
```

### Error Handling

The client provides specific error types for different failure scenarios:

```typescript
import { 
  BackgroundClientError, 
  BackgroundTimeoutError, 
  BackgroundNetworkError 
} from '@vitrinealu/background-client';

try {
  const result = await client.cleanup({
    imagePath: '/path/to/image.jpg',
    mode: 'transparent'
  });
} catch (error) {
  if (error instanceof BackgroundTimeoutError) {
    console.error('Request timed out');
  } else if (error instanceof BackgroundNetworkError) {
    console.error('Network error:', error.statusCode);
  } else if (error instanceof BackgroundClientError) {
    console.error('Client error:', error.code);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## API Reference

### CleanupRequest

```typescript
interface CleanupRequest {
  imagePath: string;                    // Path to input image
  mode?: 'transparent' | 'soften';      // Cleanup mode (default: 'transparent')
  blurRadius?: number;                  // Blur radius for soften mode
  desaturatePct?: number;               // Desaturation percentage (0-100)
  enhanceFg?: boolean;                  // Enhance foreground (default: true)
  denoise?: boolean;                    // Apply denoising (default: false)
}
```

### ReplaceRequest

```typescript
interface ReplaceRequest {
  imagePath: string;                    // Path to input image
  prompt: string;                       // Generation prompt
  negativePrompt?: string;              // Negative prompt (default: 'people, text, watermark')
  seed?: number;                        // Random seed for reproducible results
  engine?: 'SDXL' | 'RUNWAY';          // Generation engine
  steps?: number;                       // Inference steps (1-100, default: 20)
  guidanceScale?: number;               // Guidance scale (1-20, default: 7.5)
  enhanceFg?: boolean;                  // Enhance foreground (default: true)
  matchColors?: boolean;                // Match colors (default: true)
  featherEdges?: boolean;               // Feather edges (default: true)
}
```

### BackgroundMetadata

```typescript
interface BackgroundMetadata {
  mode: 'cleanup' | 'replace';          // Processing mode
  engine?: 'SDXL' | 'RUNWAY';          // Engine used (for replace mode)
  outJpg?: string;                      // Output JPEG path
  outPng?: string;                      // Output PNG path (for transparent cleanup)
  maskPath?: string;                    // Foreground mask path
  processedAt: string;                  // Processing timestamp
  prompt?: string;                      // Generation prompt (for replace mode)
  settings?: Record<string, any>;       // Processing settings
}
```

## Integration with Media Ingest

The background client is designed to integrate with the media ingest pipeline:

```typescript
// In your media processing pipeline
import { createClient } from '@vitrinealu/background-client';

const backgroundClient = createClient();

// Process after curation
if (process.env.BACKGROUND_AUTOMATION === 'replace') {
  const result = await backgroundClient.replace({
    imagePath: curatedImagePath,
    prompt: brandPresets.vitrinealu.prompts.studio
  });
  
  // Update sidecar JSON
  metadata.background = result;
}
```

## Development

### Building

```bash
pnpm build
```

### Testing

```bash
pnpm test
pnpm test:watch
```

### Linting

```bash
pnpm lint
```

## License

Internal use only - VitrineAlu Marketing