# Worker Service

Node.js 20 Fastify service providing media automation APIs. Key features:

- Zod-validated endpoints for hashing, scoring, media enhancement, captioning, and Buffer scheduling
- BullMQ + Redis queue with in-process worker processors
- Google Drive helper with local cache to download sources and store derived artefacts under `/ready/YYYY-MM/`
- Supabase logging of worker operations (table `worker_operations`)
- Vitest unit and route tests with dependency mocks
- ONNX Runtime aesthetic scoring with a lightweight linear model (configurable via `AESTHETIC_THRESHOLD`)
- Pluggable enhancement providers (Topaz CLI / Real-ESRGAN) with OpenCV post-processing

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/hash` | Compute SHA-256 of a Drive file |
| `POST` | `/score` | Run ONNX-based aesthetic score + candidate flag |
| `POST` | `/enhance` | Enhance image via Topaz/Real-ESRGAN + OpenCV color/exposure fix |
| `POST` | `/privacy/blur` | Produce privacy-safe variant |
| `POST` | `/background/cleanup` | Clean or replace background |
| `POST` | `/video/reel` | Assemble a vertical reel clip |
| `POST` | `/video/linkedin` | Compose LinkedIn-ready MP4 |
| `POST` | `/caption` | Generate on-brand caption |
| `POST` | `/schedule/buffer` | Create Buffer posts for multiple profiles |
| `GET` | `/healthz` | Queue health & metrics |

All routes submit a BullMQ job and wait for completion. Derived artefacts are uploaded to Drive and logged to Supabase (best-effort; failures are logged).

## Environment

Set the following variables (see shared `.env.example` for common keys):

- `REDIS_URL` – Redis connection string (default `redis://127.0.0.1:6379`)
- `GOOGLE_DRIVE_CACHE_DIR` – Local cache directory (auto-created)
- `GOOGLE_READY_PARENT_ID` – Optional Drive folder ID for ready artefacts
- `SUPABASE_SERVICE_ROLE_KEY` – Optional service role key for writes
- `AESTHETIC_THRESHOLD` – Approval threshold for `/score` (default `0.62`)
- `AESTHETIC_MODEL_PATH` – Override ONNX model location if needed
- `TOPAZ_CLI_BIN` – Optional path to Topaz Photo AI CLI (preferred enhancement provider)
- `REAL_ESRGAN_BIN` – Optional path to Real-ESRGAN-ncnn-vulkan binary (fallback provider)

## Development

```bash
pnpm --filter @vitrinealu/worker dev    # start server + queue worker
pnpm --filter @vitrinealu/worker test
pnpm --filter @vitrinealu/worker lint
```

Configure Redis locally (`docker run redis:7`) and export required environment variables before running.
