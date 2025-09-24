# syntax=docker/dockerfile:1.6
FROM node:20-slim AS builder
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable pnpm \
  && apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json .npmrc ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm fetch --recursive

COPY packages ./packages
COPY apps/worker ./apps/worker

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @vitrinealu/shared build
RUN pnpm --filter @vitrinealu/worker build

FROM node:20-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

# Install RealESRGAN and system dependencies
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     wget unzip ffmpeg python3 python3-pip \
     libvulkan1 curl ca-certificates \
  && wget -q -O /tmp/realesrgan.zip https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-ubuntu.zip \
  && unzip -q /tmp/realesrgan.zip -d /opt \
  && mv /opt/realesrgan-ncnn-vulkan /opt/realesrgan \
  && chmod +x /opt/realesrgan \
  && pip3 install --no-cache-dir opencv-python-headless numpy \
  && rm /tmp/realesrgan.zip \
  && apt-get remove -y wget unzip \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*

# Create fallback RealESRGAN binary placeholder (will use the installed one)
RUN ln -s /opt/realesrgan /usr/local/bin/realesrgan-ncnn-vulkan

COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/apps/worker/package.json ./package.json
COPY --from=builder /repo/apps/worker/dist ./dist
COPY --from=builder /repo/apps/worker/scripts ./scripts
COPY --from=builder /repo/packages/shared/dist ../packages/shared/dist

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD curl -f http://127.0.0.0:3001/healthz || exit 1
CMD ["node", "dist/index.js"]
