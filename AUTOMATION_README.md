# VitrineAlu Marketing Automation System

🚀 **Complete end-to-end automation for creating cinematic social media content from installation photos**

## Overview

This system automatically processes photos from Google Drive or local folders to create professional social media content:

- **Enhances** images using AI (Gemini + local fallbacks)
- **Creates** vertical reels and horizontal videos with cinematic motion
- **Generates** platform-specific captions and hashtags
- **Schedules** Buffer drafts for Instagram, TikTok, LinkedIn, Facebook
- **Provides** weekly approval workflow via email
- **Collects** performance metrics and generates reports

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Google Drive  │    │     Local        │    │     n8n         │
│   File Watcher  │───▶│   File System    │───▶│  Orchestrator   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                         │
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Worker API    │◀───│   Background     │◀───│   Enhancement   │
│   (Fastify)     │    │   Processing     │    │   (Gemini AI)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │
         ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Video         │    │   Captioner      │    │     Buffer      │
│   Assembly      │───▶│   (AI Captions)  │───▶│   Scheduling    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │
         ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Weekly        │    │   Email          │    │   Approval      │
│   Digest        │───▶│   Notifications  │───▶│   Workflow      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Quick Start

### Prerequisites

- **Docker** & **Docker Compose**
- **Node.js 20+** & **pnpm**
- **Windows 11** (recommended) or Linux/macOS
- **API Keys**: Gemini, OpenAI, Buffer
- **Google Drive** service account

### 1. Clone and Setup

```bash
git clone https://github.com/VitrineApps/vitrinealu-marketing.git
cd vitrinealu-marketing
```

### 2. Run Setup Script

**Windows (PowerShell):**
```powershell
.\scripts\setup-automation.ps1
```

**Linux/macOS:**
```bash
chmod +x scripts/setup-automation.sh
./scripts/setup-automation.sh
```

### 3. Configure Environment

Edit `infra/env/.env` with your API keys:

```env
# Required API Keys
GEMINI_API_KEY=your_gemini_api_key
OPENAI_API_KEY=your_openai_api_key
BUFFER_ACCESS_TOKEN=your_buffer_token

# Email Configuration
SMTP_URL=smtp://user:pass@smtp.gmail.com:587
APPROVAL_EMAIL=your@email.com

# Google Drive (Service Account JSON)
GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
GOOGLE_READY_PARENT_ID=your_drive_folder_id
```

### 4. Import Workflows

1. Open n8n at http://localhost:5678
2. Import these workflow files:
   - `n8n/workflows/main-automation-pipeline.json`
   - `n8n/workflows/weekly-digest-approval.json`
   - `n8n/workflows/metrics-collection-reporting.json`

### 5. Test the System

Drop photos into `assets/source/incoming/` and watch the automation work!

## Services & URLs

| Service | URL | Purpose |
|---------|-----|---------|
| **n8n** | http://localhost:5678 | Workflow orchestration & monitoring |
| **Worker API** | http://localhost:3001 | Media processing & job queuing |
| **Approvals UI** | http://localhost:3000 | Weekly content approval interface |

## Key Features

### 🎨 **AI-Powered Enhancement**
- **Gemini Vision API** for image enhancement
- **Real-ESRGAN** local fallback for upscaling
- **Background replacement** with SDXL/Runway
- **Face/license plate blurring** for privacy
- **Brand watermarking** with configurable opacity

### 🎬 **Video Creation**
- **Multiple backends**: Sora (Azure) → Runway → Pika → FFmpeg
- **Cinematic motion**: Ken Burns effects, crossfades
- **Brand overlays**: Logo, fonts, colors from config
- **Format optimization**: Vertical (9:16) and horizontal (16:9)

### ✍️ **Smart Captions**
- **Platform-specific** prompts (Instagram, TikTok, LinkedIn)
- **Brand-consistent** tone and messaging
- **EXIF-aware** context (lens type, time of day)
- **Hashtag optimization** per platform limits

### 📅 **Scheduling & Approval**
- **Buffer integration** for multi-platform posting
- **Weekly digest emails** with approval links
- **HMAC-signed URLs** for secure approvals
- **Configurable schedule** slots per platform

### 📊 **Analytics & Reporting**
- **Automated metrics** collection from platforms
- **Performance analysis** with insights
- **Weekly reports** via email
- **Top post identification** and recommendations

## Workflows

### 1. Main Automation Pipeline

**Trigger**: New photos in Drive/local folder
**Process**: Enhance → Video → Caption → Schedule → Notify
**Output**: Buffer drafts ready for approval

### 2. Weekly Digest & Approval

**Trigger**: Saturday 10:00 AM cron
**Process**: Collect pending → Generate digest → Send email
**Output**: Approval email with signed links

### 3. Metrics Collection

**Trigger**: Sunday 6:00 AM cron  
**Process**: Fetch metrics → Analyze → Generate report
**Output**: Performance report via email

## Configuration

### Brand Configuration (`config/brand.yaml`)

```yaml
brand:
  name: VitrineAlu
  tagline: "Bring light into living"
  colors:
    primary: "#0C2436"
    accent: "#1274B7"
  fonts:
    heading: "Poppins-SemiBold"
    body: "Inter-Regular"
  watermark:
    file: "/assets/brand/logo-white.png"
    opacity: 0.7
    position: "bottom-right"
```

### Schedule Configuration (`config/schedule.yaml`)

```yaml
timezone: "Europe/London"
slots:
  - id: mon_reel
    day: "Mon"
    time: "18:00"
    platforms: ["instagram_reel","tiktok","youtube_short"]
    format: "vertical"
    duration_s: 20
```

### Provider Configuration (`config/providers.yaml`)

```yaml
video:
  backend_order: ["sora_azure","runway","pika","ffmpeg"]
caption:
  provider_order: ["openai","gemini"]
approvals:
  email_day: "Sat"
  email_time: "10:00"
```

## API Endpoints

### Worker API (`localhost:3001`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/hash` | Compute SHA-256 of Drive file |
| `POST` | `/score` | ONNX aesthetic scoring |
| `POST` | `/enhance` | AI image enhancement |
| `POST` | `/background/cleanup` | Background processing |
| `POST` | `/video/reel` | Create vertical video |
| `POST` | `/video/linkedin` | Create horizontal video |
| `POST` | `/caption` | Generate platform captions |
| `POST` | `/schedule/buffer` | Create Buffer drafts |
| `GET` | `/digest/pending` | Get posts awaiting approval |
| `POST` | `/digest/generate` | Generate approval email |
| `GET` | `/metrics/published-posts` | Get published posts |
| `POST` | `/metrics/collect` | Collect platform metrics |

## Development

### Project Structure

```
vitrinealu-marketing/
├── apps/
│   ├── worker/           # Main API service
│   ├── n8n-orchestrator/ # Custom n8n image
│   ├── web-approvals/    # Approval UI
│   └── background/       # Background processing
├── packages/
│   ├── captioner/        # AI caption generation
│   ├── background-client/# Background API client
│   ├── video-assembler/  # Video creation
│   └── shared/           # Shared utilities
├── n8n/workflows/        # Automation workflows
├── config/               # Brand & schedule config
└── infra/compose/        # Docker infrastructure
```

### Commands

```bash
# Development
pnpm dev                  # Start all services in dev mode
pnpm build                # Build all packages
pnpm test                 # Run tests
pnpm lint                 # Lint code

# Infrastructure
pnpm up                   # Start Docker services
pnpm down                 # Stop Docker services

# Validation
pnpm validate-brand-config # Validate brand.yaml
```

### Adding New Platforms

1. **Add platform config** in `config/schedule.yaml`
2. **Create caption prompt** in `packages/captioner/src/prompts/`
3. **Add Buffer profile** mapping in worker API
4. **Update workflow** to include new platform

## Monitoring & Troubleshooting

### Health Checks

```bash
curl http://localhost:3001/healthz  # Worker API
curl http://localhost:5678/healthz  # n8n (if available)
```

### Logs

```bash
# Docker services
docker-compose -f infra/compose/docker-compose.yml logs -f

# Specific service
docker-compose -f infra/compose/docker-compose.yml logs worker
```

### Common Issues

**n8n workflows not triggering:**
- Check webhook URLs in workflow settings
- Verify environment variables are set
- Check service connectivity

**Image enhancement failing:**
- Verify `GEMINI_API_KEY` is valid
- Check GPU availability for local fallbacks
- Review worker logs for errors

**Buffer drafts not created:**
- Verify `BUFFER_ACCESS_TOKEN` permissions
- Check Buffer profile IDs in config
- Review rate limits

## Production Deployment

### Security Checklist

- [ ] Use strong `APPROVAL_HMAC_SECRET`
- [ ] Enable HTTPS with valid certificates
- [ ] Restrict API access with firewall rules
- [ ] Rotate API keys regularly
- [ ] Enable audit logging

### Scaling Considerations

- **Redis cluster** for queue resilience
- **Multiple worker instances** for throughput
- **External storage** (S3/GCS) for assets
- **Database replication** for data safety

## Support

- **Documentation**: See `/docs` folder
- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions

## License

Private - VitrineApps Ltd.

---

**🚀 Ready to automate your social media content creation!**