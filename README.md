# Mini Apty

A Manifest V3 Digital Adoption Platform: a Chrome extension that **authors** and **plays** guided
walkthroughs overlaid on any third‑party website, backed by a Node.js API. pnpm monorepo, strict
TypeScript throughout.

- `packages/backend` — Express + Mongoose + JWT API (MongoDB)
- `packages/extension` — MV3 extension: service worker, Chrome Side Panel (React + Tailwind +
  Zustand + Zod), content script with a closed Shadow‑DOM overlay

**End‑to‑end flow:** sign up / log in → **Author** (record steps by clicking elements on the page) →
save to the backend → **Preview** (list the site's saved walkthroughs) → **Play** (an on‑page
balloon walks the user through each step, resuming across refreshes).

---

## Quick start

```bash
cp .env.example .env          # set JWT_SECRET (≥16 chars); defaults work for local dev
docker compose up --build     # mongo + backend (:4000) + extension build --watch
```

Load the extension: `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
select `packages/extension/dist`. Open the side panel from the toolbar icon, sign up, and go.

| Action | Command |
| --- | --- |
| Launch all (DB, API, extension build) | `docker compose up --build` |
| Stop all | `docker compose down` |
| Tail logs | `docker compose logs -f` |
| Run backend tests | `docker compose exec backend pnpm test` |

Health: <http://localhost:4000/health>. The extension talks to `VITE_API_BASE_URL`
(default `http://localhost:4000`).

### Without Docker

```bash
pnpm install
docker compose up -d mongo               # or point MONGO_URI at any Mongo
pnpm --filter backend dev                # API on :4000
pnpm --filter extension build            # → packages/extension/dist (load unpacked)
pnpm --filter backend test && pnpm -r typecheck
```

---

## Architecture & MV3

Four execution contexts with one rule: **the service worker is the only context that touches the
network or the JWT.** The side panel is UI; the content script is DOM; the worker brokers.

```
SIDE PANEL (React/Zustand)  ──Port "panel" (RPC + keep-alive)──▶  SERVICE WORKER (MV3, ephemeral)
  auth / mode / author / preview                                   backend I/O, JWT, cache, relay
        ▲                                                                   │
        │  Port events (auth.expired, author.captured)                      │ chrome.tabs.sendMessage
        └───────────────────────────────────────────────────────────       ▼
                                                            CONTENT SCRIPT (per tab, isolated world)
                                                              capture · targeting · player
                                                                          │ direct DOM
                                                                          ▼
                                                        OVERLAY (closed Shadow DOM): affordance + balloon
```

- **Typed Port‑RPC.** The panel opens one long‑lived `chrome.runtime.Port`; requests are
  id‑correlated (`lib/port-client.ts`), and the worker pushes unsolicited events (captured steps,
  session‑expired) over the same Port. The contract is a single typed map in `shared/messages.ts`.
- **MV3 lifecycle.** The worker is treated as **stateless between events** — it *will* be evicted.
  Durable state lives in `chrome.storage`; the open Port + a ~20 s ping only *extend* a session,
  never *hold* state. On eviction the worker cold‑starts and rehydrates from storage.
- **Service worker, not a background page.** All network/JWT logic lives in one place
  (`background/service-worker.ts`), so the content script and panel never see a raw token, and
  fetches to the backend ride the extension's host permissions (no CORS dance).

---

## Element targeting (the hard part)

A plain `div > div:nth-child(3)` selector dies on the first re‑render. Instead we capture a
**multi‑signal descriptor** at author time and **re‑resolve by scoring** at play time.

**Capture (`content/targeting/descriptor.ts`).** For each clicked element we record tiers, most→
least stable:

1. **Attributes** — a CSS selector built *only* from stable attributes (`data-testid/test/qa`,
   non‑generated `id`, `name`, `aria-label`, `role`, `type`, `placeholder`), **deliberately
   excluding class names** (utility/hashed classes are noise). Generated‑looking ids
   (`:r3:`, long hashes, leading digits) are rejected.
2. **Text** — normalized text + accessible name + tag.
3. **Anchor** — nearest ancestor that *has* a stable selector, plus the path from it to the target
   (survives churn above the anchor), the associated `<label>` text, and the sibling index.
4. **Layout** — bounding rect (tie‑breaker only) + viewport quadrant (captured, not scored).
5. **Fallback** — a brittle `nth-of-type` path + a fingerprint, used only as last resort.

**Resolve (`content/targeting/resolver.ts`).** Gather candidates from each tier, score them, and
pick the best **only if it clears a threshold *and* beats the runner‑up by a margin** — otherwise
return `null`. Weights: **attributes ≫ text > anchor ≫ layout**. Concretely, every signal the
descriptor captures contributes: stable attrs (testid +50, id +40, selector +30, name +25,
aria‑label +20, placeholder/href +12, role +8, type +5), text (accessible name +16, normalized
+10, tag +4), anchor (inside the stable ancestor +12, **exact path *from* it +18**, associated
`<label>` text +12, sibling index +4), the brittle `fallbackCss` (+8) and `fingerprint` (+10), and
layout drift (+6/+2). The two precise positional paths (`pathFromAnchor`, `fallbackCss`) are
pre‑resolved once and act as strong tie‑breakers — they're what separates three identical
"Book a demo" links that match attrs/text/fingerprint the same. (`layout.quadrant` is captured but
not scored — redundant with the rect and equally scroll‑dependent.)

A *wrong* match is worse than no match, so ambiguous ties refuse to guess — **with one exception**:
when the tied candidates form a **nested chain** (a wrapper and the real target, where bubbled text
makes both score equally), the resolver keeps the one whose box best matches the captured rect
rather than refusing. The resolver is null‑safe (descriptors may be partial) and never throws onto
the host page.

**Trade‑offs.** More signals = more robust but heavier capture/scoring (text length capped,
candidate count capped, positional paths weighted as tie‑breakers — never overriding real
attr/text signals — because `nth-of-type` shifts on re‑render). Stable‑attribute‑only selectors
miss elements with no good attributes — which is exactly why the text and anchor tiers exist. The
scoring weights are heuristic; they could be learned/tuned with real‑world data.

### SPA / re‑render resilience

At play time `renderStep()` resolves with **retry then poll** (fast retries, then a slow background
poll) so late/async renders attach automatically; if an element truly can't be found it shows a
non‑blocking degraded balloon (you can still Skip/Back/Next) and keeps polling. Walkthroughs are
keyed by **origin + path pattern** (`*` per dynamic segment), and the player only runs on a page
whose path matches the pattern — so a refresh or navigation back resumes the right walkthrough at
the right step.

---

## Backend

Express + Mongoose + JWT, strict TS (ESM via `tsx`). Run via `docker compose`; Mongo is the store.

**API**

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/auth/signup` · `/auth/login` | email/password → `{ token, user }` |
| `GET` | `/auth/me` | current user (proves token round‑trips) |
| `POST` | `/walkthroughs` | create (owner = caller) |
| `GET` | `/walkthroughs?origin=&path=` | owner‑scoped; `path` wildcard‑matches stored patterns |
| `GET·PUT·DELETE` | `/walkthroughs/:id` | owner‑only |

**Auth & authZ.** Passwords are bcrypt‑hashed; login returns a JWT (`{ sub }`). `authenticate`
middleware validates `Authorization: Bearer` → `req.userId` (**401** on missing/invalid). Ownership
is enforced in the service layer: not‑found → **404**, not‑your‑resource → **403** (never
404‑hidden — the 401‑vs‑403 distinction is explicit). Login is enumeration‑safe (unknown email and
wrong password both 401); duplicate email maps from the unique‑index violation → 409.

**Error handling.** One Express error middleware renders every failure as a uniform
`{ error: { code, message, details } }` envelope, branching `ZodError` → `VALIDATION_ERROR`,
`AppError` → its status, else 500. Handlers stay clean async/await behind an `asyncHandler` wrapper.

**Lifecycle & ops.** `SIGTERM`/`SIGINT` drain the Mongoose pool gracefully (with a force‑exit
guard); `uncaughtException`/`unhandledRejection` log fatal and shut down. Structured logging via
`pino`/`pino-http` (one line per request, secrets redacted, silent under test). Env is
Zod‑validated at boot (fails fast).

**Tests.** `vitest` + `supertest` (21 tests: auth, walkthrough CRUD/authZ matrix, health) run
against the real Mongo service in a dedicated `mini-apty-test` DB —
`docker compose exec backend pnpm test`. (We avoid `mongodb-memory-server` because its `mongod`
binary doesn't run on Alpine/musl, our image base.)

---

## Resilience, isolation & error UX (extension)

- **Network‑failure tolerance.** The **player works offline once loaded** — the full walkthrough is
  cached in `chrome.storage.local`, so refresh/return and same‑walkthrough replay work with the
  backend down; `walkthrough.play` falls back to the cached copy if the fetch fails. Reads in the
  list/play paths degrade to a clear error state when there's nothing cached.
- **Distinct error states.** The worker normalizes the backend envelope into discriminated
  `ApiError` kinds — **network / auth / validation / conflict / unknown** — and the panel branches
  on them (inline field errors vs banner vs re‑login). A 401 on any authed call pushes
  `auth.expired`, dropping the panel to the login screen.
- **No clashes with the host page.** The overlay lives in a **closed Shadow DOM** with scoped
  styles and max z‑index; the author "pick" click is swallowed with capture‑phase
  `preventDefault` + `stopImmediatePropagation` so the host page never reacts to a selection; the
  player's spotlight ring is `pointer-events:none` so real clicks still reach the page.
- **Error boundary.** A React error boundary wraps the panel so a render error can't blank the UI.

---

## Project layout

```
packages/backend/src
  app.ts · index.ts         # app wiring + graceful shutdown
  config/                   # Zod env, Mongo connect/disconnect
  models/  schemas/         # Mongoose models, Zod request schemas
  services/ controllers/ routes/   # auth + walkthroughs (route → controller → service → model)
  middleware/  lib/         # authenticate, error handler, logger, AppError, asyncHandler
packages/extension/src
  background/service-worker.ts     # the broker (network, JWT, relay, cache)
  content/                  # index (host) · targeting/{descriptor,resolver} · overlay/{affordance,balloon} · player
  sidepanel/                # React: Auth, Home, Author, Preview screens
  store/  hooks/  lib/  shared/     # Zustand stores, hooks, Port client, typed messages + player types
```

---

## Configuration

`.env` (see `.env.example`): `MONGO_URI`, `JWT_SECRET` (≥16 chars), `JWT_EXPIRES_IN`, `CORS_ORIGIN`,
`PORT`, optional `LOG_LEVEL`, and `VITE_API_BASE_URL` (inlined into the extension at build time).

---

## Trade‑offs & what I'd do next

- **JWT in `chrome.storage.local`** (worker‑only): not encrypted at rest, but unreachable by host‑
  page JS and survives worker eviction (vs in‑memory, which forces re‑login constantly). Short TTL;
  a refresh‑token flow would be the next step.
- **Author save is backend‑only today.** The planned **write‑ahead cache + offline FIFO queue**
  ("Sync Pending" → drained on reconnect) for *authoring while offline* is not yet built — saving
  surfaces a clear error if the backend is down. The *player* side of offline (cache‑first) **is**
  implemented.
- **Player progress is persisted by the content script** (not the worker) — content scripts share
  `chrome.storage.local`, so resume survives worker eviction with no round‑trip. A deliberate
  deviation from a strict "worker owns all persistence" reading, for resilience.
- **SPA handling is retry/poll‑based**, not a long‑lived `MutationObserver` re‑resolution loop —
  enough for late renders; an observer would react faster to heavy re‑render churn.
- **Targeting weights are heuristic** and top‑frame only (no iframes); one active walkthrough per
  origin. Next: tune scoring on real apps, add a verify‑before‑advance check, and iframe support.
