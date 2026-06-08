import { initAffordance, arm, disarm } from './overlay/affordance';
import { initPlayer, startPlayerFromStorage, stopPlayer } from './player';
import type { ContentCommand } from '../shared/messages';
import type { DraftStep } from './targeting/types';

/**
 * Content script — owns DOM access for this tab. It hosts the author capture
 * overlay and the player balloon inside a closed Shadow DOM so host-page
 * CSS/z-index/event handlers cannot break (or be broken by) our UI.
 */

const OVERLAY_HOST_ID = 'mini-apty-overlay-root';

function mountOverlayHost(): ShadowRoot | null {
  if (document.getElementById(OVERLAY_HOST_ID)) return null;

  const host = document.createElement('div');
  host.id = OVERLAY_HOST_ID;
  // Zero-footprint, top-most container; children opt back into pointer events.
  host.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'width:0',
    'height:0',
    'z-index:2147483647',
    'pointer-events:none',
  ].join(';');

  const shadow = host.attachShadow({ mode: 'closed' });
  document.documentElement.appendChild(host);
  return shadow;
}

// Idempotent: re-injection (SPA navigations, double-inject) is a no-op.
const shadowRoot = mountOverlayHost();
if (shadowRoot) {
  initAffordance(shadowRoot, (step: DraftStep) => {
    void chrome.runtime.sendMessage({ type: 'author.captured', step });
  });
  initPlayer(shadowRoot);

  // Resume an in-progress walkthrough after a refresh / navigation back.
  void startPlayerFromStorage();

  // Commands relayed from the service worker.
  chrome.runtime.onMessage.addListener((message: unknown) => {
    const command = message as ContentCommand;
    switch (command.type) {
      case 'author.arm':
        arm();
        break;
      case 'author.disarm':
        disarm();
        break;
      case 'player.start':
        void startPlayerFromStorage();
        break;
      case 'player.stop':
        stopPlayer();
        break;
    }
  });
}
