# syntax=docker/dockerfile:1.6
FROM node:20-slim AS builder
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable pnpm \
  && apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json .npmrc .eslintrc.cjs ./
COPY apps/web-approvals/package.json apps/web-approvals/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm fetch --recursive

COPY packages ./packages
COPY apps/web-approvals ./apps/web-approvals

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @vitrinealu/shared build
RUN pnpm --filter @vitrinealu/web-approvals build

FROM node:20-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /repo/apps/web-approvals/.next/standalone ./
COPY --from=builder /repo/apps/web-approvals/.next/static ./.next/static

EXPOSE 3000
ENV PORT=3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD curl -f http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "server.js"]
