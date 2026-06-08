# Build context is the repo root (see docker-compose.yml).
FROM node:20-alpine

ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

# Manifests first for cache-friendly installs.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/backend/package.json ./packages/backend/package.json
COPY packages/extension/package.json ./packages/extension/package.json
RUN pnpm install --filter extension... --frozen-lockfile

COPY tsconfig.base.json ./tsconfig.base.json
COPY packages/extension ./packages/extension

# Emits dist/ (bind-mounted back to the host) and watches for changes.
CMD ["pnpm", "--filter", "extension", "build", "--watch"]
