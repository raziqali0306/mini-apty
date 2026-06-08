# Mini Apty

A Manifest V3 Digital Adoption Platform: a Chrome extension that authors and plays guided
walkthroughs on any website, backed by a Node.js API. pnpm monorepo.

- `packages/backend` — Express + Mongoose + JWT API (MongoDB store)
- `packages/extension` — MV3 extension: service worker, Chrome Side Panel (React + Tailwind +
  Zustand + Zod), content script with a Shadow-DOM overlay

> Status: **scaffold**. The runtime architecture (Port keep-alive, Shadow-DOM overlay host,
> graceful DB shutdown, uniform error envelope, strict TS) is wired; auth, author, and player
> flows build on top of it.

## Prerequisites

- Docker (Desktop or Engine) with Compose
- For non-Docker local dev: Node 20+ and pnpm 9

## Run with Docker (recommended)

```bash
cp .env.example .env        # adjust JWT_SECRET etc. as needed
docker compose up --build   # starts mongo, backend (:4000), extension build --watch
```

Then load the unpacked extension in Chrome: `chrome://extensions` → enable Developer mode →
**Load unpacked** → select `packages/extension/dist`.

| Action | Command |
| --- | --- |
| Launch all (DB, API, extension build) | `docker compose up --build` |
| Stop all | `docker compose down` |
| Tail logs | `docker compose logs -f` |
| Run backend tests | `docker compose exec backend pnpm test` |

Health check: <http://localhost:4000/health>

## Local dev without Docker

```bash
pnpm install
pnpm --filter backend dev        # needs a reachable MONGO_URI in .env
pnpm --filter extension build    # or: dev (HMR), output in packages/extension/dist
pnpm --filter backend test
pnpm -r typecheck
```
