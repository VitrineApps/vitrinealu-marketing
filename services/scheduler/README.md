# Social Media Content Scheduler

A comprehensive TypeScript/Node.js service for scheduling and managing social media content across multiple platforms with Buffer API integration, automated approval workflows, and email digests.

## Features

- **Multi-Platform Support**: Instagram, TikTok, YouTube Shorts, LinkedIn, Facebook
- **Buffer API Integration**: Create, schedule, and manage posts via Buffer API v2
- **Smart Scheduling**: Optimal posting times based on platform-specific algorithms
- **Approval Workflows**: HTML email digests with one-click approve/reject
- **Webhook Security**: HMAC-validated webhook endpoints for approval actions
- **Database Storage**: SQLite/PostgreSQL support with full CRUD operations
- **Email Notifications**: SMTP/SendGrid integration for digest delivery
- **CLI Tools**: Command-line interface for manual operations
- **Automated Tasks**: Cron jobs for weekly digests and post publishing
- **Docker Support**: Containerized deployment with docker-compose
- **Comprehensive Testing**: Jest test suite with 21+ tests

## Architecture

```text
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   CLI Tools     │    │  Webhook Server │    │   Cron Jobs     │
│                 │    │   (Express)     │    │                 │
│ • draft         │    │ • /webhooks/    │    │ • Weekly digest │
│ • send-digest   │    │   approval      │    │ • Publish       │
│ • serve         │    │ • HMAC security │    │   approved      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Core Service  │
                    │                 │
                    │ • Repository    │
                    │ • Buffer Client │
                    │ • Planning      │
                    │ • Digest Gen    │
                    │ • Mailer        │
                    └─────────────────┘
                             │
                    ┌─────────────────┐
                    │   Database      │
                    │   (SQLite/PG)   │
                    └─────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm
- Buffer API access token
- SMTP server or SendGrid account

### Installation

```bash
# Clone and install dependencies
git clone <repository-url>
cd services/scheduler
pnpm install

# Copy environment configuration
cp .env.example .env
```

### Environment Configuration

Create a `.env` file with the following variables:

```env
# Database
DATABASE_URL=sqlite:./data/scheduler.db

# Buffer API
BUFFER_ACCESS_TOKEN=your_buffer_access_token

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Alternative: SendGrid
# SMTP_HOST=smtp.sendgrid.net
# SMTP_PORT=587
# SMTP_USER=apikey
# SMTP_PASS=your-sendgrid-api-key

# Webhook Security
WEBHOOK_SECRET=your-webhook-secret-key

# Branding
BRAND_NAME=Your Brand Name
BASE_URL=http://localhost:3000

# Optional: PostgreSQL (instead of SQLite)
# DATABASE_URL=postgresql://user:pass@localhost:5432/scheduler
```

### Development

```bash
# Start development server
pnpm run dev

# Run tests
pnpm test

# Build for production
pnpm run build
```

### Docker Deployment

```bash
# Build and start with docker-compose
docker-compose up -d

# View logs
docker-compose logs -f scheduler

# Stop services
docker-compose down
```

## API Reference

### CLI Commands

```bash
# Create and schedule a draft post
pnpm run cli draft --platform instagram --caption "Hello world!" --hashtags "#test"

# Send approval digest for next week
pnpm run cli send-digest

# Start webhook server
pnpm run cli serve --port 3000
```

### Webhook Endpoints

#### POST /webhooks/approval

Handles approval/rejection actions from email digests.

**Query Parameters:**
- `token`: HMAC signature for request validation
- `postId`: ID of the post being approved/rejected
- `action`: Either "approve" or "reject"

**Example:**

```http
POST /webhooks/approval?token=abc123&postId=post-456&action=approve
```

### Database Schema

#### Posts Table

```sql
CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  platform TEXT NOT NULL,
  caption TEXT NOT NULL,
  hashtags TEXT NOT NULL, -- JSON array
  media_urls TEXT NOT NULL, -- JSON array
  thumbnail_url TEXT,
  scheduled_at DATETIME NOT NULL,
  buffer_draft_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### Approvals Table

```sql
CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  action TEXT NOT NULL,
  approved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  approved_by TEXT,
  notes TEXT,
  FOREIGN KEY (post_id) REFERENCES posts (id)
);
```

#### Channels Table

```sql
CREATE TABLE channels (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  buffer_channel_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Configuration

### Brand Configuration

Create a `config/brand.yaml` file for custom branding:

```yaml
name: "Your Brand"
logo: "https://example.com/logo.png"
colors:
  primary: "#007bff"
  secondary: "#6c757d"
email:
  from: "noreply@yourbrand.com"
  replyTo: "hello@yourbrand.com"
```

### Platform Settings

The service includes platform-specific posting algorithms:

- **Instagram**: Best posting times are 11 AM - 1 PM and 7 PM - 9 PM on weekdays
- **TikTok**: Peak engagement at 6 PM - 10 PM daily
- **YouTube Shorts**: Optimal posting 2 PM - 4 PM on weekdays
- **LinkedIn**: Business hours 8 AM - 5 PM weekdays
- **Facebook**: Consistent posting 1 PM - 3 PM daily

## Testing

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test -- --coverage

# Run specific test file
pnpm test repository.test.ts

# Watch mode
pnpm test -- --watch
```

Test coverage includes:

- Repository database operations
- Buffer API client integration
- Email digest generation
- HTML template processing
- Date range calculations

## Deployment

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure production database (PostgreSQL recommended)
- [ ] Set up SSL certificates for webhook endpoints
- [ ] Configure monitoring and logging
- [ ] Set up backup strategy for database
- [ ] Configure rate limiting for webhook endpoints
- [ ] Test email delivery with production SMTP

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | Database connection string | Yes |
| `BUFFER_ACCESS_TOKEN` | Buffer API access token | Yes |
| `SMTP_HOST` | SMTP server hostname | Yes |
| `SMTP_PORT` | SMTP server port | Yes |
| `SMTP_USER` | SMTP username | Yes |
| `SMTP_PASS` | SMTP password | Yes |
| `WEBHOOK_SECRET` | Secret key for webhook HMAC | Yes |
| `BRAND_NAME` | Brand name for emails | No |
| `BASE_URL` | Base URL for webhook links | Yes |

## Troubleshooting

### Common Issues

#### Database Connection Failed

- Ensure DATABASE_URL is correctly formatted
- For SQLite, ensure the directory is writable
- For PostgreSQL, verify connection credentials

#### Buffer API Errors

- Check BUFFER_ACCESS_TOKEN is valid
- Verify API rate limits haven't been exceeded
- Ensure profile IDs are correct

#### Email Delivery Issues

- Verify SMTP credentials
- Check spam folder for test emails
- Ensure firewall allows SMTP port

#### Webhook Signature Validation

- Ensure WEBHOOK_SECRET matches between sender and receiver
- Check that request body is exactly as sent
- Verify HMAC algorithm (SHA-256)

### Logs

```bash
# View application logs
docker-compose logs -f scheduler

# View with timestamps
docker-compose logs -f --timestamps scheduler
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
