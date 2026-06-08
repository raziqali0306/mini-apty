import { useEffect, useState } from 'react';
import { PANEL_PORT, type WorkerToPanel } from '../shared/messages';

const PING_INTERVAL_MS = 20_000;

/**
 * Opens the long-lived Port to the service worker and pings it on an interval.
 * The ping/pong both keeps the MV3 worker warm during a session and surfaces a
 * simple connection signal to the UI. Side effects live here, not in the view.
 */
export function useWorkerPort(): { connected: boolean } {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const port = chrome.runtime.connect({ name: PANEL_PORT });
    setConnected(true);

    port.onMessage.addListener((raw: unknown) => {
      const msg = raw as WorkerToPanel;
      if (msg.type === 'pong') setConnected(true);
    });
    port.onDisconnect.addListener(() => setConnected(false));

    const ping = (): void => port.postMessage({ type: 'ping', t: Date.now() });
    ping();
    const timer = window.setInterval(ping, PING_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
      port.disconnect();
    };
  }, []);

  return { connected };
}
