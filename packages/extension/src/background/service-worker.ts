import {
  PANEL_PORT,
  type ApiError,
  type Credentials,
  type SessionUser,
} from '../shared/messages';

/**
 * MV3 service worker — the single broker for network + JWT. It owns all backend
 * I/O and persists the session in chrome.storage.local, so the worker stays
 * stateless between events and the session survives panel close / worker
 * eviction. The panel reaches it over the `panel` Port (see lib/port-client).
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';
const STORAGE_KEY = 'auth';

interface StoredAuth {
  token: string;
  user: SessionUser;
}

interface IncomingRequest {
  id: number;
  type: 'ping' | 'auth.session' | 'auth.signup' | 'auth.login' | 'auth.logout';
  payload?: Credentials;
}

/** Carries a normalized ApiError up to the request handler. */
class ApiCallError extends Error {
  constructor(public readonly apiError: ApiError) {
    super(apiError.message);
  }
}

// Open the side panel when the toolbar icon is clicked.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err: unknown) => console.error('[sw] setPanelBehavior failed', err));
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PANEL_PORT) return;
  port.onMessage.addListener((raw: unknown) => {
    void handleRequest(raw as IncomingRequest, port);
  });
});

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
      if (!req.payload) {
        throw new ApiCallError({ kind: 'validation', message: 'Email and password are required' });
      }
      const path = req.type === 'auth.signup' ? '/auth/signup' : '/auth/login';
      const result = await apiFetch<StoredAuth>(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.payload),
      });
      await setStored(result);
      return { user: result.user };
    }
    case 'auth.logout':
      await clearStored();
      return {};
    default:
      throw new ApiCallError({ kind: 'unknown', message: 'Unknown request' });
  }
}

async function apiFetch<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiCallError({ kind: 'network', message: 'Cannot reach the server' });
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new ApiCallError(normalizeError(res.status, body));
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
