# Implementation Log

A running, append-only record of what was built, why, and how it was verified. Newest
entries go at the bottom. Each entry notes the decisions made so they can be defended later.

---

## Entry 1 — Monorepo scaffold + Docker Compose (2026-06-08)

**Goal:** Stand up the pnpm-workspace monorepo (backend + extension) wired to run under Docker
Compose with MongoDB. Build-order step 1 from the plan. Skeletons only — the runtime
architecture is wired; auth/author/player flows build on top.

### What was created

**Root (workspace + Docker)**
- `package.json` (private root, pnpm@9.15, convenience scripts), `pnpm-workspace.yaml`
- `tsconfig.base.json` — shared strict config (`strict`, `noUnusedLocals/Parameters`,
  `noImplicitReturns/Override`, `isolatedModules`, `noEmit`), extended by both packages
- `docker-compose.yml` — `mongo` (healthcheck + named volume), `backend` (depends on mongo
  healthy, source bind-mount for live reload), `extension` (`build --watch`, emits `dist/` to host)
- `.env.example`, `.dockerignore`, `pnpm-lock.yaml`, README with run instructions

**`packages/backend`** — Express + Mongoose + JWT-ready, strict TS, ESM (`type: module`, run via `tsx`)
- `src/index.ts` — bootstrap + **graceful shutdown** on SIGTERM/SIGINT (drains Mongoose pool,
  10s force-exit guard)
- `src/app.ts` (no port bind, so supertest can drive it in-process), `config/env.ts`
  (Zod-validated env, fails fast), `config/db.ts` (connect/disconnect lifecycle)
- `middleware/error-handler.ts` — **uniform `{ error: { code, message, details } }` envelope**;
  branches ZodError → `VALIDATION_ERROR`, `AppError` → its status/code, else 500
- `lib/app-error.ts` — `AppError` + helpers incl. **401 `unauthorized` vs 403 `forbidden`**
- `lib/async-handler.ts` — wraps async handlers so rejections reach the error middleware
- `routes/health.routes.ts`, `__tests__/health.test.ts` (Vitest + supertest), `Dockerfile`

**`packages/extension`** — MV3, React + Tailwind + Zustand + Zod, strict TS
- `src/manifest.ts` (`@crxjs/vite-plugin` `defineManifest`) — service worker + side panel +
  content script; permissions `sidePanel/storage/activeTab/scripting/tabs/alarms`
- `background/service-worker.ts` — **Port keep-alive** broker; stateless-by-default
  (ping/pong resets idle timer); opens side panel on action click
- `content/index.ts` — idempotent **closed Shadow-DOM overlay host** (zero-footprint,
  max z-index, `pointer-events:none`) so host-page CSS/events can't clash
- `sidepanel/` (React app + Tailwind), `hooks/use-worker-port.ts` (Port side effect isolated
  from the view), `store/use-app-store.ts`, `shared/messages.ts` (typed Port contract)
- `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, `vite-env.d.ts`, `Dockerfile`

### Key decisions
- **pnpm + Docker parity:** Dockerfiles run the same `pnpm install --frozen-lockfile` /
  `dev` / `build --watch` commands validated locally, so "works locally" ⇒ "works in Docker".
- **Extensionless relative imports** everywhere — resolve consistently across `tsx`, Vite, and
  Vitest (a `.js` specifier would not remap to `.ts` under Vite).
- **`@crxjs/vite-plugin@2.4.0` (stable)** chosen over the v2 beta line for MV3 manifest/HMR.
- **Backend runs via `tsx`** (no emit step); `tsconfig` is `noEmit` for typecheck only.
- **SW treated as stateless**; durable state will live in `chrome.storage.local`. Port ping
  only *extends* a session, never *holds* state.

### Verification
| Check | Result |
| --- | --- |
| `pnpm install` | ✓ lockfile generated |
| `pnpm -r typecheck` | ✓ both packages clean |
| `pnpm --filter backend test` | ✓ 2/2 passing |
| `pnpm --filter extension build` | ✓ emits `dist/manifest.json`, SW, content script, side panel |
| `docker-compose config` | ✓ valid |
| git ignore (`node_modules`/`dist`/`.env`) | ✓ ignored |
| `docker compose build` (node:20-alpine) | ✓ corepack + `pnpm install --frozen-lockfile` OK on musl |
| `docker compose up -d` | ✓ mongo healthy, backend connected, extension built |
| `GET /health` (in-stack) | ✓ `{"status":"ok","db":"connected"}` |
| `dist/manifest.json` on host (bind mount) | ✓ present |
| `docker compose exec backend pnpm test` | ✓ 2/2 (required adding a root `test` script) |

**Notes:**
- Dockerfiles switched to `node:20-alpine` (smaller; backend has no native deps —
  `bcryptjs` is pure-JS). The lockfile records musl rollup/esbuild binaries so the frozen
  install resolves them.
- `docker compose exec backend pnpm test` runs in WORKDIR `/app` (workspace root), so a root
  `"test": "pnpm --filter backend test"` script was added to honor the documented command.
- A local `.env` was created from `.env.example` (gitignored) so the stack runs out of the box.

### Next
Backend auth + walkthrough layer: Mongoose `User`/`Walkthrough` models → `/auth/signup|login`
(JWT) → walkthrough CRUD with per-owner authZ (401 vs 403) → handler/service unit tests.

---

## Entry 2 — Structured logging (requests + errors + crashes) (2026-06-08)

**Goal:** Proper logging across the backend: every request, every error, and process-level
crashes — replacing the ad-hoc `console.log`s from Entry 1.

### What changed
- **`pino` + `pino-http`** added (deps); `pino-pretty` (dev) for human-readable dev output.
- `lib/logger.ts` — single shared pino instance. Level from `LOG_LEVEL` (new optional env),
  defaulting `debug` in dev / `info` in prod / **`silent` in test** (keeps Vitest clean).
  Pretty transport in dev, JSON in prod. **Redacts** `authorization`/`cookie`/`set-cookie`.
- `middleware/request-logger.ts` — `pino-http`: one compact line per request
  (`req {id,method,url}`, `res {statusCode}`, `responseTime`). Severity by outcome:
  5xx→error, 4xx→warn, else info. Custom serializers drop header/IP noise. Attaches a
  per-request child logger at `req.log`.
- `middleware/error-handler.ts` — now uses the per-request logger. **Split:** expected client
  errors (4xx: validation/auth/authz/404) are logged once at `warn` by the request logger, so
  the handler doesn't re-log them (no noisy stacks); only genuine 5xx/unexpected faults are
  logged at `error` with full stack.
- `index.ts` — `console` → logger; added **process crash handlers**: `uncaughtException` and
  `unhandledRejection` log `fatal` (with stack) then run the shared graceful shutdown and exit
  non-zero. `db.ts` `console` → logger.

### Decisions
- **pino over a custom logger:** standard, fast, structured JSON, child loggers per request —
  defensible and less code than rolling our own at this quality bar.
- **Don't double-log 4xx:** request logger already records them; re-logging in the error
  handler just added redundant lines and stacks. Server faults still get a full stack.
- `pino-pretty` only used when `NODE_ENV=development`; our Docker installs all deps and runs
  `dev`, so it's always present where used.

### Verification
| Check | Result |
| --- | --- |
| `pnpm --filter backend typecheck` | ✓ (incl. `req.log` typing from pino-http) |
| `docker compose up -d --build backend` | ✓ boots with pino |
| `GET /health` log | ✓ `INFO: GET /health 200` (compact, no headers) |
| `GET /nope` log | ✓ single `WARN: GET /nope 404` (no stack) |
| `pnpm --filter backend test` | ✓ 2/2, logger silent (clean output) |

### Next
Unchanged — backend auth + walkthrough layer (models → auth → CRUD + authZ → tests).
