# n8n Orchestrator

Custom n8n image with workspace specific nodes, credential templates, and starter folders for workflow hygiene.

## Features

- Extends the official `n8nio/n8n` image and bakes the `@vitrinealu/shared` utilities into custom nodes.
- `/data` is the writable mount that persists workflows, credentials and binaries. Docker Compose already maps this location to the `n8n_data` volume.
- Credential templates in `/data/templates/credentials` reference local environment variables so sensitive values stay in `.env`.
- Optional community packages can be pre-installed by passing `--build-arg COMMUNITY_NODES="<package list>"` to the Docker build.

## Managed Folders & Workflows

An initial blank workflow bundle with the agreed folder structure lives at `workflows/blank-collection.json`. It defines the following folders:

- `00_Utils`
- `10_Ingest`
- `20_Create`
- `30_Schedule`
- `40_Approve`
- `50_Metrics`

You can import this bundle with the n8n CLI after the container is running:

```bash
# Import starter folders/workflows (inside the container)
n8n import:workflow --input=/data/workflows/templates/blank-collection.json
```

## Exporting & Importing via CLI

Use the bundled n8n CLI from inside the running container. Examples below assume Docker Compose from the repo root.

```bash
# Open a shell inside the n8n container
docker compose -f infra/compose/docker-compose.yml exec n8n sh

# Export every workflow to /data/workflows/export.json
n8n export:workflow --all --output=/data/workflows/export.json

# Export credentials (stored under /data/templates/custom-credentials.json)
n8n export:credentials --all --output=/data/templates/exported-credentials.json --decrypted

# Import workflows from a local file you copied into /data/workflows
n8n import:workflow --input=/data/workflows/new-workflows.json

# Import credentials (ensure the file is only readable by the node user)
n8n import:credentials --input=/data/templates/credentials.json
```

Copy files back to the host with `docker cp` if needed, e.g. `docker cp n8n:/data/workflows/export.json ./exports/workflows.json`.

## Credential Templates

Templates ship with the image and can be customised in the UI:

- `buffer-api.json` - uses `BUFFER_ACCESS_TOKEN`
- `smtp.json` - parses host/user/password from `SMTP_URL`
- `webhook-secret.json` - exposes `WEBHOOK_SIGNING_SECRET`
- `openai.json` - reads `OPENAI_API_KEY`
- `google-drive-service-account.json` - pulls structured fields from `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`

Update `infra/env/.env` with the corresponding values before starting the stack so that expressions resolve on boot.
