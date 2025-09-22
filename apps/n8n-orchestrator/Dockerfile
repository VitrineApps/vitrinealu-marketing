# syntax=docker/dockerfile:1.6
FROM node:20-slim AS builder
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable pnpm \
  && apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json .npmrc ./
COPY apps/n8n-orchestrator/package.json apps/n8n-orchestrator/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm fetch --recursive

COPY packages ./packages
COPY apps/n8n-orchestrator ./apps/n8n-orchestrator

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @vitrinealu/shared build
RUN pnpm --filter @vitrinealu/n8n-orchestrator build

FROM n8nio/n8n:1.67.1
USER root

RUN apk update \
  && apk add --no-cache curl \
  && rm -rf /var/cache/apk/*

ENV N8N_USER_FOLDER=/data \
    N8N_CUSTOM_EXTENSIONS=/data/custom \
    N8N_DEFAULT_TIMEZONE=Europe/London \
    N8N_TELEMETRY_ENABLED=false \
    N8N_DIAGNOSTICS_ENABLED=false \
    N8N_VERSION_NOTIFICATIONS_ENABLED=false \
    N8N_EXECUTIONS_RETRY_COUNT=3 \
    NODE_PATH=/data/custom/node_modules

ARG COMMUNITY_NODES=""

RUN mkdir -p /data/custom/nodes /data/custom/shared /data/templates/credentials /data/workflows/templates /data/community \
  && if [ -n "$COMMUNITY_NODES" ]; then \
       npm install --prefix /data/community --no-save $COMMUNITY_NODES; \
     fi

COPY --from=builder /repo/apps/n8n-orchestrator/dist /data/custom/nodes
COPY --from=builder /repo/packages/shared /data/custom/node_modules/@vitrinealu/shared
COPY --from=builder /repo/apps/n8n-orchestrator/config/templates /data/templates
COPY --from=builder /repo/apps/n8n-orchestrator/workflows /data/workflows/templates

RUN chown -R node:node /data

VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 CMD curl -f http://127.0.0.1:5678/healthz || exit 1

USER node

CMD ["n8n"]
