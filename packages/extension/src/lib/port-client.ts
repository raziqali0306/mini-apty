import {
  PANEL_PORT,
  type ApiError,
  type RpcPayloadMap,
  type RpcResultMap,
  type RpcType,
  type WorkerEvent,
} from '../shared/messages';

const PING_INTERVAL_MS = 20_000;

interface Pending {
  resolve: (data: unknown) => void;
  reject: (error: ApiError) => void;
}

type WorkerEventListener = (event: WorkerEvent) => void;

/**
 * Single Port to the service worker, shared by the panel. Correlates each
 * request with its response by id, keeps the worker warm with a periodic ping,
 * and reconnects lazily after the worker is evicted (the Port disconnects).
 */
class PortClient {
  private port: chrome.runtime.Port | undefined;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Set<WorkerEventListener>();
  private pingTimer: number | undefined;

  private connect(): chrome.runtime.Port {
    const port = chrome.runtime.connect({ name: PANEL_PORT });
    port.onMessage.addListener((msg: unknown) => this.handleMessage(msg));
    port.onDisconnect.addListener(() => this.handleDisconnect());
    this.port = port;
    this.pingTimer = window.setInterval(() => {
      void this.request('ping').catch(() => undefined);
    }, PING_INTERVAL_MS);
    return port;
  }

  private handleDisconnect(): void {
    this.port = undefined;
    if (this.pingTimer !== undefined) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
    const error: ApiError = { kind: 'network', message: 'Lost connection to the extension worker' };
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  private handleMessage(msg: unknown): void {
    const m = msg as
      | { id: number; ok: true; data: unknown }
      | { id: number; ok: false; error: ApiError }
      | WorkerEvent;

    if ('id' in m) {
      const pending = this.pending.get(m.id);
      if (!pending) return;
      this.pending.delete(m.id);
      if (m.ok) pending.resolve(m.data);
      else pending.reject(m.error);
      return;
    }

    for (const listener of this.listeners) listener(m);
  }

  request<T extends RpcType>(type: T, payload?: RpcPayloadMap[T]): Promise<RpcResultMap[T]> {
    const port = this.port ?? this.connect();
    const id = this.nextId++;
    return new Promise<RpcResultMap[T]>((resolve, reject) => {
      this.pending.set(id, { resolve: (data) => resolve(data as RpcResultMap[T]), reject });
      port.postMessage({ id, type, payload });
    });
  }

  onEvent(listener: WorkerEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const portClient = new PortClient();
