# VitrineAlu Marketing Automation Runbook

## Initial Setup

### 1. Environment Variables

#### Core Services
- `REDIS_URL` – Redis connection string (default `redis://127.0.0.1:6379`)
- `GOOGLE_DRIVE_CACHE_DIR` – Local cache directory (auto-created)
- `GOOGLE_READY_PARENT_ID` – Drive folder ID for ready artefacts
- `SUPABASE_SERVICE_ROLE_KEY` – Service role key for database writes
- `SUPABASE_URL` – Supabase project URL

#### AI & Enhancement
- `OPENAI_API_KEY` – OpenAI API key for caption generation
- `CAPTION_MODEL` – OpenAI model for captions (default: `gpt-4o-mini`)
- `AESTHETIC_THRESHOLD` – Approval threshold for scoring (default `0.62`)
- `TOPAZ_CLI_BIN` – Optional path to Topaz Photo AI CLI
- `REAL_ESRGAN_BIN` – Optional path to Real-ESRGAN-ncnn-vulkan binary

**Note:** In tests or when `OPENAI_API_KEY` is unset, captions use a deterministic DummyAdapter.

#### Buffer Integration
- `BUFFER_ACCESS_TOKEN` – Buffer API access token
- `BUFFER_PROFILE_IDS_JSON` – JSON array of Buffer profile IDs, e.g. `["instagram_id", "tiktok_id"]`

#### Approval System
- `APPROVAL_HMAC_SECRET` – Secret for signing approval URLs
- `APPROVAL_BASE_URL` – Base URL for approval links (e.g. `https://approve.yourdomain.com`)

### 4. TypeScript Configuration

**Note:** Root `tsconfig.base.json` now sets `baseUrl="."` and ESM paths.

### 2. Database Setup

Run the core migration in your Supabase SQL editor:

```sql
-- Execute the contents of /docs/migrations/001_core.sql
-- This creates assets, variants, posts, and metrics tables
```

### 3. n8n Workflow Import & Scheduling

Import the following workflows to n8n:

1. **30_Schedule_Drafts.json** - Creates Buffer drafts and posts entries
2. **40_Approve_OneClick.json** - Handles approval/rejection via signed URLs  
3. **50_Metrics_Digest.json** - Collects performance metrics

#### Recommended Cron Schedule:
- **Saturday 09:00** - Run `30_Schedule_Drafts` to create weekly content
- **Sunday 17:00** - Run `50_Metrics_Digest` to collect previous week's metrics

To set crons in n8n:
1. Open each workflow
2. Click the "Cron" trigger node
3. Set expression: `0 9 * * 6` (Saturday 9am) or `0 17 * * 0` (Sunday 5pm)
4. Save and activate workflow

## Quick Schedule Smoke Test

This test validates the complete scheduling and approval flow:

### Prerequisites
1. Set `BUFFER_PROFILE_IDS_JSON` and `BUFFER_ACCESS_TOKEN` in environment
2. Ensure at least one asset in Supabase with `status = 'READY'` and associated variants
3. n8n workflows imported and credentials configured

### Test Steps

1. **Trigger Draft Creation**
   ```bash
   # Manually run 30_Schedule_Drafts workflow in n8n
   # Or trigger via webhook if configured
   ```

2. **Verify Draft Creation**
   ```sql
   -- Check Supabase for new posts
   SELECT id, asset_id, channel, status, buffer_id, scheduled_at 
   FROM public.posts 
   WHERE status = 'AWAITING_APPROVAL'
   ORDER BY created_at DESC;
   ```
   
   Expected: New rows with `buffer_id` populated and `status = 'AWAITING_APPROVAL'`

3. **Send Approval Email**
   ```bash
   # Run 40_Approve_SummaryEmail workflow in n8n
   # Check email for approval links
   ```

4. **Test Approval Flow**
   - Click "Approve" link in email
   - Should see success message in web interface
   
5. **Verify Approval**
   ```sql
   -- Check posts are now approved
   SELECT id, status, approved_at 
   FROM public.posts 
   WHERE status = 'APPROVED'
   ORDER BY approved_at DESC;
   ```
   
   Expected: Posts switch to `APPROVED` status with `approved_at` timestamp

6. **Verify Buffer Scheduling**
   - Check Buffer dashboard
   - Posts should be scheduled according to `scheduled_at` times
   - Drafts should no longer be in draft state

### Common Issues

- **No Buffer ID**: Check `BUFFER_PROFILE_IDS_JSON` format and profile permissions
- **Approval links broken**: Verify `APPROVAL_HMAC_SECRET` and `APPROVAL_BASE_URL` 
- **Email not sent**: Check SMTP credentials in n8n
- **Posts not scheduled**: Verify Buffer API token has scheduling permissions

## Production Checklist

- [ ] All environment variables configured
- [ ] Database migration applied
- [ ] n8n workflows imported and activated
- [ ] Cron schedules configured
- [ ] SMTP credentials for approval emails
- [ ] Buffer profiles connected and permissions verified
- [ ] Approval web interface deployed and accessible
- [ ] Redis instance running and accessible
- [ ] Google Drive service account configured with folder access