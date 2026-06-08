# Build context is the repo root (see docker-compose.yml).
FROM node:20-alpine

ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

# Install with the workspace graph intact, leveraging layer caching:
# copy only manifests first so deps re-install only when they change.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/backend/package.json ./packages/backend/package.json
COPY packages/extension/package.json ./packages/extension/package.json
RUN pnpm install --filter backend... --frozen-lockfile

# App source + shared config.
COPY tsconfig.base.json ./tsconfig.base.json
COPY packages/backend ./packages/backend

EXPOSE 4000
CMD ["pnpm", "--filter", "backend", "dev"]
