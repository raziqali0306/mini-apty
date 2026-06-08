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

---

## Entry 3 — Auth: schemas + endpoints (signup / login / me) (2026-06-08)

**Goal:** First slice of the backend API — email/password auth returning a JWT, runnable and
tested end-to-end, before touching walkthroughs.

### What was built
- **Model** `models/user.model.ts` — `User` (email unique+lowercased, passwordHash, timestamps);
  `toJSON` strips `_id`/`__v`/`passwordHash` and exposes `id`.
- **Utils** `lib/password.ts` (bcryptjs hash/verify, cost 10), `lib/jwt.ts` (sign `{sub}` /
  verify with the `@types/jsonwebtoken@9` `expiresIn` cast).
- **Auth middleware** `middleware/authenticate.ts` — `Bearer` → `req.userId`, 401 on
  missing/invalid; Express `Request` augmented in `types/express.d.ts`.
- **Validation** `schemas/auth.schema.ts` — Zod signup/login (email + min-length password).
- **Service/controller/routes** — pure `auth.service` (signup/login, throws `AppError`s),
  thin controllers, `routes/auth.routes.ts`: `POST /auth/signup`, `POST /auth/login`,
  `GET /auth/me` (behind `authenticate`). Added `conflict()` (409) to `lib/app-error.ts`;
  mounted `/auth` in `app.ts`.
- **Tests** `__tests__/setup.ts` (connect to real mongo, dedicated `mini-apty-test` DB, clear
  between tests) + `auth.test.ts` (10 cases). `vitest.config.ts`: `setupFiles`,
  `fileParallelism:false`, MONGO_URI computed in setup (not hardcoded).

### Decisions / gotchas
- **Mongoose is CJS** → under Node's native ESM (how `tsx` runs in the container) the named
  import `{ models }` isn't exposed and throws at runtime (`does not provide an export named
  'models'`), even though it typechecks and passes under Vitest (different CJS interop). Fix:
  `import mongoose from 'mongoose'` and use `mongoose.Schema/model/models`. Lesson: prefer the
  default import for CJS deps in this ESM backend.
- **Explicit `Schema<User>` interface** instead of `InferSchemaType` (the latter inferred
  `unknown` fields here).
- **Login is enumeration-safe:** unknown email and wrong password both return the same 401.
- **Duplicate email** mapped from the unique-index violation (atomic) → 409.

### Verification
| Check | Result |
| --- | --- |
| `pnpm --filter backend typecheck` | ✓ |
| `pnpm --filter backend test` | ✓ 12/12 (10 auth + 2 health) |
| End-to-end curl vs running container | ✓ signup 201, me 200/401, login 200/401, dup 409, invalid 400 |

### Next
Walkthrough layer: `Walkthrough`/`Step` model → Zod schemas → CRUD service/controller/routes
behind `authenticate`, per-owner authZ (403), list by origin/path → tests.

---

## Entry 4 — Extension login/signup UI (SW-brokered auth) (2026-06-08)

**Goal:** Login + signup screens in the side panel, wired to the auth backend, following the
architecture where the **service worker is the only network broker**.

### What was built
- **Typed Port-RPC contract** `shared/messages.ts` — request payloads + result maps keyed by RPC
  type; normalized `ApiError` (`network|auth|validation|conflict|unknown`).
- **Service worker** `background/service-worker.ts` — now the broker: handles `auth.signup/login/
  logout/session` + `ping`, does the `fetch` to `VITE_API_BASE_URL`, **persists `{token,user}` in
  `chrome.storage.local`** (session survives panel close), and normalizes the backend error
  envelope into `ApiError`. JWT/credentials never live in the panel.
- **Panel Port client** `lib/port-client.ts` — one Port, request/response correlation by id,
  20 s keep-alive ping, lazy reconnect on worker eviction (rejects in-flight requests).
- **Auth store** `store/use-auth-store.ts` (Zustand) — `loading/anonymous/authenticated`, `init`
  (restores session), `login/signup/logout`, error state. Side effects isolated from views.
- **Screens** `sidepanel/AuthScreen.tsx` — login⇄signup toggle, Zod client validation
  (`schemas/auth.ts`), inline field errors (client + server) and a top banner per error kind;
  `App.tsx` routes on status (loading→spinner, anonymous→AuthScreen, authed→shell + sign-out).
- **Error boundary** `components/ErrorBoundary.tsx` wrapping the app in `main.tsx`.
- `vite.config.ts` `envDir: '../../'` so the root `.env` `VITE_API_BASE_URL` is picked up
  (fallback `http://localhost:4000`). Removed the superseded `use-worker-port` hook (keep-alive
  now lives in the Port client).

### Decisions
- **SW-brokered network (not panel `fetch`)** — matches the plan, centralizes JWT, avoids CORS
  (host-permission fetch from the worker), and the RPC layer is reusable for walkthrough/player.
- **Session in `chrome.storage.local`**, read on panel open → survives panel close / worker
  eviction (the worker stays stateless between events).
- Error kinds drive the UI: validation→inline fields, network/auth/conflict→banner.

### Verification
| Check | Result |
| --- | --- |
| `pnpm --filter extension typecheck` | ✓ |
| `pnpm --filter extension build` (host + Alpine container watch) | ✓ SW broker + screens bundle |
| Backend auth endpoints (Entry 3) | ✓ already verified end-to-end |

**Not yet done:** in-browser click-through (no Chrome in this env). To test: reload the unpacked
extension (`packages/extension/dist`) in Chrome, open the side panel → signup/login → reload to
confirm the session persists → sign out. Backend must be up (`docker compose up -d`).

### Next
Unchanged — walkthrough layer; then the author flow can reuse the Port-RPC + SW broker.
