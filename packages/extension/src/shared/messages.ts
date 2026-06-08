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

/** Request payloads, keyed by RPC type. */
export interface RpcPayloadMap {
  ping: undefined;
  'auth.session': undefined;
  'auth.signup': Credentials;
  'auth.login': Credentials;
  'auth.logout': undefined;
}

/** Success results, keyed by RPC type. */
export interface RpcResultMap {
  ping: { t: number };
  'auth.session': { user: SessionUser | null };
  'auth.signup': { user: SessionUser };
  'auth.login': { user: SessionUser };
  'auth.logout': Record<string, never>;
}

export type RpcType = keyof RpcResultMap;

/** Worker → panel pushes that aren't replies to a request. */
export type WorkerEvent = { type: 'auth.expired' };
