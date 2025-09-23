# VitrineAlu Automation Runbook

## Goal
Auto-produce cinematic shorts and platform captions from photos dropped into Google Drive or the local repository, queue Buffer drafts, and approve weekly.

## Prerequisites
- Populate .env (see .env.example).
- Share Google Drive folder vitrinealu/incoming/ with the service-account email listed in /secrets/google-sa.json.
- Review and adjust /config/brand.yaml, /config/schedule.yaml, /config/providers.yaml for brand, scheduling, and backend preferences.
- Create or validate Buffer access (or Wix Automations if only triggering) and store the credentials in .env.

## Daily Flow
1. Drop photos into Google Drive:/vitrinealu/incoming/ or assets/source/incoming/.
2. n8n watches the folder, enhances via Gemini, generates video via Sora (with fallbacks), produces captions (OpenAI/Gemini), uploads media, and creates Buffer drafts following schedule.yaml.
3. Outputs land in assets/ready/ (enhanced media) and assets/renders/ (videos).

## Weekly Flow (Sat/Sun)
1. System emails a digest (thumbnails, captions, schedule slots).
2. Click Approve All (or per-post). Approved drafts auto-publish according to the configured slot times.

## Manual Overrides
- Asset bypass: Move any asset to assets/ready/force/ to skip curation.
- Caption override: Place a {assetId}.caption.override.json next to the media; n8n will use the override text.

## Monitoring
- n8n UI: http://localhost:5678 → monitor failed executions.
- Logs: docker compose logs -f video | enhance | scheduler.
- Storage: confirm processed outputs in ./assets/ready/ and ./assets/renders/.

## Recovery Steps
1. Retry failed nodes directly in n8n.
2. If Sora is unavailable, set VIDEO_BACKEND=runway (or pika / ffmpeg) in /config/providers.yaml and requeue.
3. Re-run the affected workflow or drop assets back into incoming.

## Security Notes
- Keep .env out of version control; rotate secrets regularly.
- Use a long WIX_WEBHOOK_SECRET and enforce HMAC on approval links.
- Face/license-plate blurring is enabled by default; verify watermark/blur settings in providers.yaml.
