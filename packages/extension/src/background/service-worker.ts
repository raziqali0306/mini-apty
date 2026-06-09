import {
  PANEL_PORT,
  type ApiError,
  type AuthorContext,
  type ContentEvent,
  type Credentials,
  type RpcType,
  type SaveWalkthroughInput,
  type SavedWalkthrough,
  type SessionUser,
  type WalkthroughListResult,
  type WalkthroughSummary,
  type WorkerEvent,
} from '../shared/messages';
import { toPattern } from '../lib/path-pattern';
import {
  playerKey,
  walkthroughKey,
  type PlayerSession,
  type PlayerStep,
  type PlayerWalkthrough,
} from '../shared/player';
import {
  enqueue,
  readMirror,
  readQueue,
  removeMirrorEntry,
  upsertMirror,
  writeQueue,
  type MirrorEntry,
  type QueueItem,
  type SyncStatus,
} from './offline';

/**
 * MV3 service worker — the single broker for network + JWT and the relay between
 * the side panel and the content script. It owns all backend I/O, persists the
 * session in chrome.storage.local, and stays stateless between events (durable
 * state lives in storage; the open panel Port keeps it warm during a session).
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';
const STORAGE_KEY = 'auth';

interface StoredAuth {
  token: string;
  user: SessionUser;
}

interface IncomingRequest {
  id: number;
  type: RpcType;
  payload?: unknown;
}

interface AuthorSession {
  recording: boolean;
  tabId: number;
}

/** Carries a normalized ApiError up to the request handler. */
class ApiCallError extends Error {
  constructor(public readonly apiError: ApiError) {
    super(apiError.message);
  }
}

// Open panel Ports, so the worker can push events (captured steps, auth.expired).
const panelPorts = new Set<chrome.runtime.Port>();

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err: unknown) => console.error('[sw] setPanelBehavior failed', err));
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PANEL_PORT) return;
  panelPorts.add(port);
  port.onMessage.addListener((raw: unknown) => {
    void handleRequest(raw as IncomingRequest, port);
  });
  port.onDisconnect.addListener(() => panelPorts.delete(port));
});

// Content script → worker: relay captured steps to the panel.
chrome.runtime.onMessage.addListener((message: unknown) => {
  const event = message as ContentEvent;
  if (event.type === 'author.captured') {
    broadcast({ type: 'author.captured', step: event.step });
  }
});

function broadcast(event: WorkerEvent): void {
  for (const port of panelPorts) port.postMessage(event);
}

// Drain the offline save-queue when connectivity returns, on a periodic alarm,
// and (best-effort) on worker startup.
self.addEventListener('online', () => void drainQueue());
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'drain-queue') void drainQueue();
});
void drainQueue();

async function handleRequest(req: IncomingRequest, port: chrome.runtime.Port): Promise<void> {
  try {
    const data = await route(req);
    port.postMessage({ id: req.id, ok: true, data });
  } catch (err) {
    const error: ApiError =
      err instanceof ApiCallError ? err.apiError : { kind: 'unknown', message: 'Unexpected error' };
    port.postMessage({ id: req.id, ok: false, error });
  }
}

async function route(req: IncomingRequest): Promise<unknown> {
  switch (req.type) {
    case 'ping':
      return { t: Date.now() };
    case 'auth.session': {
      const stored = await getStored();
      return { user: stored?.user ?? null };
    }
    case 'auth.signup':
    case 'auth.login': {
      const creds = req.payload as Credentials | undefined;
      if (!creds) {
        throw new ApiCallError({ kind: 'validation', message: 'Email and password are required' });
      }
      const path = req.type === 'auth.signup' ? '/auth/signup' : '/auth/login';
      const result = await apiFetch<StoredAuth>(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      });
      await setStored(result);
      void drainQueue(); // flush anything queued while signed out
      return { user: result.user };
    }
    case 'auth.logout':
      await clearStored();
      return {};
    case 'author.context':
      return authorContext();
    case 'author.start':
      return authorStart();
    case 'author.stop':
      return authorStop();
    case 'walkthrough.save':
      return saveWalkthrough(req.payload as SaveWalkthroughInput | undefined);
    case 'walkthrough.list':
      return listWalkthroughs();
    case 'walkthrough.play':
      return playWalkthrough(req.payload as { id: string } | undefined);
    default:
      throw new ApiCallError({ kind: 'unknown', message: 'Unknown request' });
  }
}

// ── author ───────────────────────────────────────────────────────────────────

async function authorContext(): Promise<AuthorContext> {
  const tab = await activeTab();
  if (!tab?.url) throw new ApiCallError({ kind: 'unknown', message: 'No active tab to author on' });
  let url: URL;
  try {
    url = new URL(tab.url);
  } catch {
    throw new ApiCallError({ kind: 'unknown', message: 'Active tab has no valid URL' });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ApiCallError({ kind: 'unknown', message: "Can't author on this page" });
  }
  return { origin: url.origin, path: url.pathname, suggestedPattern: toPattern(url.pathname) };
}

async function authorStart(): Promise<{ ok: true }> {
  const tab = await activeTab();
  if (tab?.id === undefined) {
    throw new ApiCallError({ kind: 'unknown', message: 'No active tab to record on' });
  }
  await chrome.storage.session.set({
    author: { recording: true, tabId: tab.id } satisfies AuthorSession,
  });
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'author.arm' });
  } catch {
    throw new ApiCallError({
      kind: 'unknown',
      message: "Can't record on this page — open a normal website tab first.",
    });
  }
  return { ok: true };
}

async function authorStop(): Promise<{ ok: true }> {
  const session = await getAuthorSession();
  if (session) {
    try {
      await chrome.tabs.sendMessage(session.tabId, { type: 'author.disarm' });
    } catch {
      // Tab closed/navigated — nothing to disarm.
    }
  }
  await chrome.storage.session.remove('author');
  return { ok: true };
}

interface BackendWalkthrough {
  id: string;
  name: string;
  origin: string;
  pathPattern: string;
  version: number;
  steps: PlayerStep[];
}

/**
 * Save with write-ahead local mirroring: persist to extension storage first, try
 * the backend, and — if it's only a network failure — keep it "Sync Pending" in a
 * FIFO queue drained on reconnect. Validation/auth errors are surfaced (not queued).
 */
async function saveWalkthrough(
  input: SaveWalkthroughInput | undefined,
): Promise<{ walkthrough: SavedWalkthrough; synced: boolean }> {
  if (!input) throw new ApiCallError({ kind: 'validation', message: 'Nothing to save' });

  const tempId = `local:${crypto.randomUUID()}`;
  await upsertMirror(input.origin, {
    id: tempId,
    name: input.name,
    origin: input.origin,
    pathPattern: input.pathPattern,
    steps: input.steps,
    version: 1,
    syncStatus: 'pending',
    updatedAt: Date.now(),
  });

  try {
    const saved = await apiFetch<BackendWalkthrough>(
      '/walkthroughs',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) },
      { auth: true },
    );
    await removeMirrorEntry(input.origin, tempId);
    await upsertMirror(input.origin, toMirrorEntry(saved, 'synced'));
    return { walkthrough: summaryOf(saved), synced: true };
  } catch (err) {
    if (err instanceof ApiCallError && err.apiError.kind === 'network') {
      await enqueue({ tempId, payload: input });
      ensureDrainAlarm();
      return {
        walkthrough: {
          id: tempId,
          name: input.name,
          origin: input.origin,
          pathPattern: input.pathPattern,
          version: 1,
        },
        synced: false,
      };
    }
    await removeMirrorEntry(input.origin, tempId); // roll back the optimistic mirror
    throw err;
  }
}

function summaryOf(w: BackendWalkthrough): SavedWalkthrough {
  return { id: w.id, name: w.name, origin: w.origin, pathPattern: w.pathPattern, version: w.version };
}

function toMirrorEntry(w: BackendWalkthrough, status: SyncStatus): MirrorEntry {
  return {
    id: w.id,
    name: w.name,
    origin: w.origin,
    pathPattern: w.pathPattern,
    steps: w.steps,
    version: w.version,
    syncStatus: status,
    updatedAt: Date.now(),
  };
}

function summaryFromMirror(m: MirrorEntry): WalkthroughSummary {
  return {
    id: m.id,
    name: m.name,
    pathPattern: m.pathPattern,
    stepCount: m.steps.length,
    syncStatus: m.syncStatus,
  };
}

function ensureDrainAlarm(): void {
  chrome.alarms.create('drain-queue', { periodInMinutes: 1 });
}

/** Flush queued saves in FIFO order; stop on network/auth so order is preserved. */
async function drainQueue(): Promise<void> {
  const queue = await readQueue();
  if (queue.length === 0) {
    await chrome.alarms.clear('drain-queue');
    return;
  }

  const remaining: QueueItem[] = [];
  let blocked = false;
  for (const item of queue) {
    if (blocked) {
      remaining.push(item);
      continue;
    }
    try {
      const saved = await apiFetch<BackendWalkthrough>(
        '/walkthroughs',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item.payload) },
        { auth: true },
      );
      await removeMirrorEntry(item.payload.origin, item.tempId);
      await upsertMirror(item.payload.origin, toMirrorEntry(saved, 'synced'));
    } catch (err) {
      const kind = err instanceof ApiCallError ? err.apiError.kind : 'unknown';
      if (kind === 'network' || kind === 'auth') {
        remaining.push(item);
        blocked = true;
      } else {
        await removeMirrorEntry(item.payload.origin, item.tempId); // unrecoverable; drop
      }
    }
  }

  await writeQueue(remaining);
  if (remaining.length === 0) await chrome.alarms.clear('drain-queue');
}

/** List the user's walkthroughs for the active origin, merging the local mirror. */
async function listWalkthroughs(): Promise<WalkthroughListResult> {
  const tab = await activeTab();
  const origin = httpOrigin(tab?.url);
  if (!origin) return { context: null, walkthroughs: [] };

  let backendList: BackendWalkthrough[] | null = null;
  try {
    backendList = await apiFetch<BackendWalkthrough[]>(
      `/walkthroughs?origin=${encodeURIComponent(origin.origin)}`,
      { method: 'GET' },
      { auth: true },
    );
  } catch (err) {
    if (err instanceof ApiCallError && err.apiError.kind === 'network') backendList = null;
    else throw err;
  }

  const mirror = await readMirror(origin.origin);
  const context = { origin: origin.origin, path: origin.path };

  if (!backendList) {
    // Offline — serve the mirror (cached synced + pending).
    return { context, walkthroughs: mirror.map(summaryFromMirror) };
  }

  // Refresh the cache and append still-pending local saves.
  for (const w of backendList) await upsertMirror(origin.origin, toMirrorEntry(w, 'synced'));
  const pending = mirror.filter((m) => m.syncStatus === 'pending');
  return {
    context,
    walkthroughs: [
      ...backendList.map((w) => ({
        id: w.id,
        name: w.name,
        pathPattern: w.pathPattern,
        stepCount: w.steps.length,
        syncStatus: 'synced' as const,
      })),
      ...pending.map(summaryFromMirror),
    ],
  };
}

/**
 * Load a walkthrough, cache it for offline, seed/resume the player session for
 * the active tab's origin, and tell the content script to start. The CS reads
 * the session from storage (so a later refresh resumes without us).
 */
async function playWalkthrough(input: { id: string } | undefined): Promise<{ ok: true }> {
  if (!input?.id) throw new ApiCallError({ kind: 'validation', message: 'No walkthrough selected' });
  const tab = await activeTab();
  const origin = httpOrigin(tab?.url);
  if (tab?.id === undefined || !origin) {
    throw new ApiCallError({ kind: 'unknown', message: "Open the walkthrough's site in a tab first" });
  }

  const walkthrough = await loadForPlay(input.id, origin.origin);
  await chrome.storage.local.set({ [walkthroughKey(walkthrough.id)]: walkthrough });

  const existing = await getSession(origin.origin);
  const stepIndex = existing?.id === walkthrough.id ? existing.stepIndex : 0;
  await chrome.storage.local.set({
    [playerKey(origin.origin)]: { id: walkthrough.id, stepIndex } satisfies PlayerSession,
  });

  await chrome.tabs.sendMessage(tab.id, { type: 'player.start' });
  return { ok: true };
}

/** Resolve a walkthrough to play: local mirror for `local:` ids, else backend
 * with cache/mirror fallback when offline. */
async function loadForPlay(id: string, origin: string): Promise<PlayerWalkthrough> {
  if (id.startsWith('local:')) {
    const entry = (await readMirror(origin)).find((m) => m.id === id);
    if (!entry) {
      throw new ApiCallError({ kind: 'unknown', message: 'This walkthrough has not synced yet' });
    }
    return entryToWalkthrough(entry);
  }
  try {
    return await apiFetch<PlayerWalkthrough>(`/walkthroughs/${id}`, { method: 'GET' }, { auth: true });
  } catch (err) {
    const cached = await getCachedWalkthrough(id);
    if (cached) return cached;
    const entry = (await readMirror(origin)).find((m) => m.id === id);
    if (entry) return entryToWalkthrough(entry);
    throw err;
  }
}

function entryToWalkthrough(entry: MirrorEntry): PlayerWalkthrough {
  return {
    id: entry.id,
    name: entry.name,
    origin: entry.origin,
    pathPattern: entry.pathPattern,
    steps: entry.steps,
  };
}

async function getCachedWalkthrough(id: string): Promise<PlayerWalkthrough | undefined> {
  const key = walkthroughKey(id);
  const result = await chrome.storage.local.get(key);
  return result[key] as PlayerWalkthrough | undefined;
}

async function getSession(origin: string): Promise<PlayerSession | undefined> {
  const key = playerKey(origin);
  const result = await chrome.storage.local.get(key);
  return result[key] as PlayerSession | undefined;
}

/** Parse an http(s) tab URL into origin + path, or undefined for other schemes. */
function httpOrigin(url: string | undefined): { origin: string; path: string } | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
    return { origin: u.origin, path: u.pathname };
  } catch {
    return undefined;
  }
}

async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

async function getAuthorSession(): Promise<AuthorSession | undefined> {
  const result = await chrome.storage.session.get('author');
  return result.author as AuthorSession | undefined;
}

// ── network + storage ────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init: RequestInit, opts?: { auth?: boolean }): Promise<T> {
  const headers = new Headers(init.headers);
  if (opts?.auth) {
    const stored = await getStored();
    if (stored?.token) headers.set('Authorization', `Bearer ${stored.token}`);
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiCallError({ kind: 'network', message: 'Cannot reach the server' });
  }

  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    if (opts?.auth && res.status === 401) broadcast({ type: 'auth.expired' });
    throw new ApiCallError(normalizeError(res.status, body));
  }
  return body as T;
}

/** Map the backend's uniform error envelope to a UI-branchable ApiError. */
function normalizeError(status: number, body: unknown): ApiError {
  const err = (body as { error?: { code?: string; message?: string; details?: unknown } } | null)
    ?.error;
  const message = err?.message ?? 'Request failed';
  switch (err?.code) {
    case 'VALIDATION_ERROR': {
      const details = err.details as { fieldErrors?: Record<string, string[]> } | undefined;
      return { kind: 'validation', message, fields: details?.fieldErrors };
    }
    case 'UNAUTHORIZED':
      return { kind: 'auth', message };
    case 'FORBIDDEN':
      return { kind: 'auth', message };
    case 'CONFLICT':
      return { kind: 'conflict', message };
    default:
      return status === 401 ? { kind: 'auth', message } : { kind: 'unknown', message };
  }
}

async function getStored(): Promise<StoredAuth | undefined> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] as StoredAuth | undefined;
}

async function setStored(value: StoredAuth): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: value });
}

async function clearStored(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}
