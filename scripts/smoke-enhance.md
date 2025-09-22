# Smoke Test: Enhance Pipeline

This guide tests the provider-agnostic image enhancement pipeline end-to-end.

## Prerequisites

- Windows with Docker Desktop
- pnpm installed
- Supabase project with assets table
- Optional: Topaz CLI, RealESRGAN binary

## 1) Set Environment Variables

Set required environment variables (adjust paths as needed):

```powershell
setx REAL_ESRGAN_BIN "C:\ai\realesrgan-ncnn-vulkan.exe"
setx TIMEZONE "Europe/London"
```

Other optional vars (see worker README.md):

- `TOPAZ_CLI`
- `ENHANCE_DEFAULT_SCALE=2`
- `ENHANCE_KEEP_SCALE=1`
- `PYTHON_BIN=python3`

## 2) Start Stack

Build and start all services:

```bash
pnpm -w build
docker compose -f infra/compose/docker-compose.yml up -d --build
```

Wait for services to be healthy (check Docker Desktop or `docker ps`).

## 3) Test Data

- Drop 3 JPG images into the INCOMING folder (configured in n8n workflow)
- Wait for assets to appear in Supabase `public.assets` table with status 'SELECTED'
- Manually trigger the "20_Create_MediaVariants" workflow on one asset (via n8n UI)

## 4) Verify Enhancement

Check worker logs:

```bash
docker logs vitrinealu-marketing-worker-1
```

Look for:

- Provider chosen: `[TopazEnhancer|RealEsrganEnhancer|NoopEnhancer]`
- OpenCV post-processing: `Running OpenCV post on /tmp/...`
- Upload success: `Uploaded enhanced to /ready/YYYY-MM/...`

Check Supabase:

- `public.variants` table has row with `variant_type='enhanced'`, `url`, `metadata` (JSONB with provider/scale/ms)

## 5) Run Unit Tests

```bash
pnpm --filter @vitrinealu/worker test
```

## Troubleshooting

- **Vulkan missing**: Install Vulkan SDK or use CPU version of RealESRGAN
- **Python not found**: Ensure `python3` is in PATH or set `PYTHON_BIN` to full path
- **Permission denied**: Check binary permissions, or run Docker as admin
- **No provider available**: Ensure at least one binary is configured or Noop will be used
- **OpenCV fails**: Check Python dependencies in worker container logs
