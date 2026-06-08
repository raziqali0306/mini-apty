import type { AdvanceTriggerKind, DraftStep, TargetDescriptor } from '../content/targeting/types';

/**
 * The typed contract between the side panel and the service worker. The panel
 * sends correlated RPC requests over a single Port; the worker replies with a
 * matching response or pushes an unsolicited event. The worker is the only
 * context that talks to the backend, so credentials/JWT never live in the panel.
 */
export const PANEL_PORT = 'panel';

export interface Credentials {
  email: string;
  password: string;
}

export interface SessionUser {
  id: string;
  email: string;
}

/** Normalized, UI-branchable failure shapes (mirrors the backend error codes). */
export type ApiErrorKind = 'network' | 'auth' | 'validation' | 'conflict' | 'unknown';

export interface ApiError {
  kind: ApiErrorKind;
  message: string;
  fields?: Record<string, string[]>;
}

// ── Author / walkthrough payloads ───────────────────────────────────────────

/** Derived from the active tab when authoring starts. */
export interface AuthorContext {
  origin: string;
  path: string;
  suggestedPattern: string;
}

/** A step in the shape the backend persists (trigger reuses the step element). */
export interface WalkthroughStepInput {
  order: number;
  title: string;
  description: string;
  target: TargetDescriptor;
  advanceTrigger: { kind: AdvanceTriggerKind };
}

export interface SaveWalkthroughInput {
  name: string;
  origin: string;
  pathPattern: string;
  steps: WalkthroughStepInput[];
}

export interface SavedWalkthrough {
  id: string;
  name: string;
  origin: string;
  pathPattern: string;
  version: number;
}

/** Lightweight row for the Preview list. */
export interface WalkthroughSummary {
  id: string;
  name: string;
  pathPattern: string;
  stepCount: number;
}

export interface WalkthroughListResult {
  /** Null when the active tab isn't a normal http(s) page. */
  context: { origin: string; path: string } | null;
  walkthroughs: WalkthroughSummary[];
}

// ── Port RPC maps ───────────────────────────────────────────────────────────

/** Request payloads, keyed by RPC type. */
export interface RpcPayloadMap {
  ping: undefined;
  'auth.session': undefined;
  'auth.signup': Credentials;
  'auth.login': Credentials;
  'auth.logout': undefined;
  'author.context': undefined;
  'author.start': undefined;
  'author.stop': undefined;
  'walkthrough.save': SaveWalkthroughInput;
  'walkthrough.list': undefined;
}

/** Success results, keyed by RPC type. */
export interface RpcResultMap {
  ping: { t: number };
  'auth.session': { user: SessionUser | null };
  'auth.signup': { user: SessionUser };
  'auth.login': { user: SessionUser };
  'auth.logout': Record<string, never>;
  'author.context': AuthorContext;
  'author.start': { ok: true };
  'author.stop': { ok: true };
  'walkthrough.save': { walkthrough: SavedWalkthrough };
  'walkthrough.list': WalkthroughListResult;
}

export type RpcType = keyof RpcResultMap;

/** Worker → panel pushes that aren't replies to a request. */
export type WorkerEvent =
  | { type: 'auth.expired' }
  | { type: 'author.captured'; step: DraftStep };

// ── Content-script ↔ worker (one-shot runtime messages, not the Port) ────────

/** Worker → content script (via chrome.tabs.sendMessage). */
export type ContentCommand = { type: 'author.arm' } | { type: 'author.disarm' };

/** Content script → worker (via chrome.runtime.sendMessage). */
export type ContentEvent = { type: 'author.captured'; step: DraftStep };
