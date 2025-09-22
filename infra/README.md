# Infrastructure

Local infrastructure powered by Docker Compose and Traefik. Certificates are generated with [mkcert](https://github.com/FiloSottile/mkcert) for trusted HTTPS on `*.localhost`.

## Prerequisites

- Docker Desktop (v4.30+ recommended)
- mkcert installed and added to your PATH

## Setup

1. Duplicate `infra/env/.env.example` to `infra/env/.env` and provide valid secrets.
2. Generate local certificates:
   ```powershell
   cd infra/compose/traefik/certs
   mkcert -install
   mkcert -cert-file mkcert.pem -key-file mkcert-key.pem "n8n.localhost" "api.localhost" "approve.localhost"
   ```
3. Start the stack from repo root:
   ```powershell
   pnpm up
   ```

Services become available at:
- https://n8n.localhost (n8n orchestrator)
- https://api.localhost (worker)
- https://approve.localhost (approvals UI)

Stop the stack with `pnpm down`.
