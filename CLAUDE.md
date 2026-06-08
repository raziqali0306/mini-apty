# Mini Apty DAP - Guidelines

## Tech Stack
- Monorepo: `pnpm` workspaces (`/packages/backend`, `/packages/extension`)
- Extension: Manifest V3, Chrome Side Panel, React, Tailwind, Zustand, Zod, TS Strict
- Backend: Node.js, Express, Mongoose ODM, TS Strict, JWT Auth
- Database: MongoDB via Docker Compose

## Development Scripts
- Install: `pnpm i`
- Containers: `docker compose up -d`
- Run Backend: `pnpm --filter backend dev`
- Build Extension: `pnpm --filter extension build`
- Run Tests: `pnpm --filter backend test`

## Extension Rules
- Style Isolation: Isolate UI using a Shadow DOM wrapper with internal Tailwind styles.
- Element Targeting: Implement fallback matching (Attributes -> Text -> Layout Anchors).
- SPA Resilience: Continuous polling loops to survive async route mutations and updates.
- Lifecycle: Keep worker awake using Side-Panel runtime Ports. Save session progress in chrome.storage.local.

## Backend Rules
- Schema: Model hierarchical tree walkthroughs as clean Mongoose structures.
- Auth / AuthZ: Validate JWT. Use 401 for bad sessions, 403 for multi-tenant tenancy breaks.
- Lifecycle: Trap SIGTERM/SIGINT signals to explicitly drain Mongoose connection pools.
- Error Handling: Handle exceptions globally via Express middleware. Output uniform JSON.

