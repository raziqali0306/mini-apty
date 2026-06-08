# Mini Apty DAP - Guidelines

## Tech Stack
- Monorepo: `pnpm` workspaces (`/packages/backend`, `/packages/extension`)
- Extension: Manifest V3, Chrome Side Panel, React, Tailwind, Zustand, Zod, TS Strict
- Backend: Node.js, Express, Mongoose ODM, TS Strict, JWT Auth
- Database: MongoDB via Docker Compose

## Development Scripts
Everything runs on Docker.
- Launch All (DB, API, Extension): `docker compose up --build`
- Stop All Containers: `docker compose down`
- View Running Logs: `docker compose logs -f`
- Run Service Tests: `docker compose exec backend pnpm test`

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

## Code Styling & Conventions
- Type Safety: Enforce strict TypeScript types globally. Never use `any` or `ts-ignore`.
- UI Components: Write pure functional React components. Avoid inline styling; use Tailwind classes.
- State Separation: Keep UI views presentational. Isolate side effects and data fetching into custom hooks or Zustand stores.
- API Patterns: Structure Express handlers using clean async/await syntax wrapped in unified try-catch logic.
- Schema Validation: Validate all API payloads and extension boundaries using strict runtime Zod objects.

