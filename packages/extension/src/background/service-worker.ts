import { PANEL_PORT, type PanelToWorker } from '../shared/messages';

/**
 * MV3 service worker — the single broker for network, JWT, cache and the
 * write-queue (added as features land). It is treated as STATELESS between
 * events: anything durable lives in chrome.storage.local, and the open panel
 * Port (with its ping/pong) only extends the session, never holds state.
 */

// Clicking the toolbar icon opens the side panel.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err: unknown) => console.error('[sw] setPanelBehavior failed', err));
});

// Long-lived Port from the side panel. Activity on it resets the worker's idle
// timer, keeping the worker warm for the duration of an author/player session.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PANEL_PORT) return;

  port.onMessage.addListener((raw: unknown) => {
    const msg = raw as PanelToWorker;
    if (msg.type === 'ping') {
      port.postMessage({ type: 'pong', t: msg.t });
    }
    // Future: auth.*, walkthrough.*, player.* RPCs.
  });

  port.onDisconnect.addListener(() => {
    // Session ended; nothing to clean up because no state is held in memory.
  });
});
