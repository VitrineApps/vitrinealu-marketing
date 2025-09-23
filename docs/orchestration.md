# Orchestration & Scheduling

## Workflow Overview
- `workflows/n8n/auto_pipeline.json`: Triggered by new assets (Google Drive + local). Calls Enhance, Video, and Caption services, then creates Buffer drafts aligned with `config/schedule.yaml` slots.
- `workflows/n8n/weekly_digest.json`: Saturday 10:00 Europe/London cron calling scheduler APIs to build the weekly digest email with signed approval links.

## Scheduler Endpoints
- `POST /api/drafts`: accepts orchestrated payloads to enqueue Buffer drafts and persist pending posts.
- `POST /api/digest`: returns HTML/text digest content generated via the digest builder.
- `POST /webhooks/approve` / `POST /webhooks/reject`: verifies `APPROVAL_HMAC_SECRET`, updates post state, and schedules or cancels Buffer drafts.

## Manual Overrides
- Drop curated media into `assets/ready/force/` to bypass AI curation.
- Provide `{assetId}.caption.override.json` alongside media to override captions.
- Adjust `config/providers.yaml.video.backend_order` to force Runway/Pika/FFmpeg fallback priority.

## Cron & Digest
- Cron (`services/scheduler/src/cron.ts`) sends the weekly digest and polls every 15 minutes to publish approved drafts.
- Digest emails sign `{postId, action, assetId, timestamp}` with `APPROVAL_HMAC_SECRET` for tamper protection.

## Data & Storage
- Posts, assets, and approvals tables are defined in `services/scheduler/migrations/20241001_auto_pipeline.sql` (targeting Postgres).
- Enhanced media lives in `/assets/ready/{date}/{assetId}/`; renders in `/assets/renders/{assetId}/`.
- Workflow JSON lives in `workflows/n8n/` for version-controlled automation definitions.
