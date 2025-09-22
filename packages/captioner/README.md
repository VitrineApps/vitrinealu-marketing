# @vitrinealu/captioner

AI-powered social media caption generator for directories with support for multiple platforms and LLM providers.

## Features

- 📁 **Directory Processing**: Process entire directories of media files
- 🎯 **Platform-Specific Captions**: Optimized prompts for Instagram, TikTok, YouTube Shorts, LinkedIn, and Facebook
- 🤖 **Dual AI Providers**: OpenAI GPT and Google Gemini support
- 📸 **EXIF Integration**: Automatic lens type and time-of-day inference from image metadata
- ⚡ **Concurrency Control**: Configurable parallel processing with p-limit
- 🔄 **Retry Logic**: Exponential backoff retries for failed API calls
- 🎨 **Brand Customization**: YAML-based brand configuration support
- 🖥️ **CLI Tool**: Command-line interface for batch processing
- 📝 **Deterministic Output**: Structured JSON schema with idempotency hashing
- 🔒 **Type Safety**: Full TypeScript support with Zod validation
- 📄 **Sidecar Files**: Individual JSON files for each media file
- 📊 **Merged Output**: Optional consolidated output file

## Installation

```bash
pnpm add @vitrinealu/captioner
```

## Quick Start

### Build and Install

```bash
# Build the package
pnpm -w --filter @vitrinealu/captioner build

# Use the CLI
vcaption --media ./packages/captioner/fixtures --platform instagram --brand ./packages/captioner/fixtures/brand.example.yaml --out ./tmp/captions.json --seed 42
```

### Provider Selection

Set providers via environment variables or CLI flags:

```bash
# Environment variables (recommended for security)
export OPENAI_API_KEY=your_key
export GEMINI_API_KEY=your_key

# Or specify via CLI
vcaption --provider openai --media ./media --platform instagram

# Available providers: mock, openai, gemini
```

### Determinism for CI

For reproducible outputs in CI/testing:

```bash
# Use seed for deterministic AI responses
vcaption --media ./media --platform instagram --seed 42

# Use mock provider for completely deterministic testing
vcaption --provider mock --media ./media --platform instagram
```

## Configuration

### Environment Variables

```bash
# Required: Choose one or both providers
OPENAI_API_KEY=your_openai_key
GEMINI_API_KEY=your_gemini_key
```

### Brand Configuration (YAML)

Create a `config/brand.yaml` file for consistent branding:

```yaml
brand: "VitrineAlu"
tone: ["premium", "elegant", "sophisticated"]
locale: "en-US"
bannedHashtags: ["spam", "inappropriate"]
```

## API Reference

### generateForDir

Main function for processing directories of media files.

```typescript
interface GenerateOptions {
  mediaDir: string;           // Directory containing media files
  platform: Platform;         // Target platform
  outFile?: string;           // Optional: merged output JSON file
  providerName?: 'openai' | 'gemini';  // AI provider (default: 'openai')
  model?: string;             // AI model to use
  seed?: number;              // Random seed for deterministic output
  concurrency?: number;       // Number of concurrent requests (default: 4)
}

const results: CaptionResult[] = await generateForDir(options);
```

### Output Schema

```typescript
interface CaptionResult extends CaptionJSON {
  meta: {
    file: string;        // Relative path to media file
    hash: string;        // SHA256 hash for idempotency
    exif?: {             // EXIF metadata (if available)
      lens: 'ultra-wide' | 'wide' | 'standard';
      timeOfDay: 'day' | 'golden_hour' | 'night';
    };
  };
}

interface CaptionJSON {
  platform: Platform;
  caption: string;                 // Main caption text
  hashtags: string[];             // Platform-optimized hashtags
  call_to_action: string;         // Call-to-action text
  compliance_notes?: string;      // Platform compliance notes
}
```

## File Processing

The generator processes common media file types:

- **Images**: `.jpg`, `.jpeg`, `.png`
- **Videos**: `.mp4`

For each media file, it:

1. Extracts EXIF metadata for contextual hints
2. Generates AI-powered caption using platform-specific prompts
3. Applies brand filtering and compliance rules
4. Saves individual sidecar JSON file: `filename.captions.platform.json`
5. Returns structured result with metadata

## Platform-Specific Features

### Instagram (30 hashtags max)

- Visual storytelling focus
- Emoji-rich, engaging captions
- Lifestyle and aesthetic hashtags

### TikTok (20 hashtags max)

- Trend-driven content
- Short, punchy captions
- Viral hashtag optimization

### YouTube Shorts (15 hashtags max)

- Hook-first approach
- Video engagement focus
- Discovery-optimized tags

### LinkedIn (10 hashtags max)

- Professional networking tone
- Industry and B2B focus
- Thought leadership CTAs

### Facebook (25 hashtags max)

- Community engagement
- Shareable content
- Conversational tone

## EXIF Integration

Automatically extracts contextual information:

- **Lens Type**: `ultra-wide`, `wide`, `standard` (from focal length)
- **Time of Day**: `day`, `golden_hour`, `night` (from capture time)
- **Location Context**: Used for location-aware captions

## Error Handling & Resilience

- **Concurrent Processing**: Configurable parallelism with failure isolation
- **Retry Logic**: 3 attempts with exponential backoff
- **Idempotency**: Hash-based duplicate detection
- **Validation**: Comprehensive input/output validation
- **Logging**: Structured logging for debugging

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Build package
pnpm build

# Type checking
pnpm typecheck

# Lint code
pnpm lint
```

## Examples

### Basic Directory Processing

```bash
# Process all photos in directory
vcaption generate --media-dir ./photos --platform instagram
```

### Advanced Configuration

```bash
# High-concurrency processing with merged output
vcaption generate \
  --media-dir ./content \
  --platform tiktok \
  --provider gemini \
  --model gemini-pro \
  --concurrency 8 \
  --seed 123 \
  --out-file batch-results.json
```

### API Usage

```typescript
import { generateForDir } from '@vitrinealu/captioner';

// Process directory with custom settings
const results = await generateForDir({
  mediaDir: './media',
  platform: 'linkedin',
  providerName: 'openai',
  model: 'gpt-4',
  concurrency: 2,
  seed: 42, // Deterministic output
  outFile: './results.json'
});

// Results include file metadata and captions
results.forEach(result => {
  console.log(`${result.meta.file}: ${result.hashtags.length} hashtags`);
});
```

## Output Files

### Individual Sidecar Files

```bash
photo1.jpg → photo1.captions.instagram.json
video1.mp4 → video1.captions.tiktok.json
```

### Merged Output (Optional)

```json
[
  {
    "platform": "instagram",
    "caption": "Beautiful sunset over mountains 🌅",
    "hashtags": ["#MountainViews", "#SunsetLovers"],
    "call_to_action": "Visit our website!",
    "meta": {
      "file": "photo1.jpg",
      "hash": "a1b2c3...",
      "exif": {
        "lens": "wide",
        "timeOfDay": "golden_hour"
      }
    }
  }
]
```

## License

UNLICENSED
