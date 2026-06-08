import { initAffordance, arm, disarm } from './overlay/affordance';
import type { ContentCommand } from '../shared/messages';
import type { DraftStep } from './targeting/types';

/**
 * Content script — owns DOM access for this tab. It hosts the author capture
 * overlay inside a closed Shadow DOM so host-page CSS/z-index/event handlers
 * cannot break (or be broken by) our UI. The player overlay attaches here later.
 */

const OVERLAY_HOST_ID = 'mini-apty-overlay-root';

function mountOverlayHost(): ShadowRoot | null {
  if (document.getElementById(OVERLAY_HOST_ID)) return null;

  const host = document.createElement('div');
  host.id = OVERLAY_HOST_ID;
  // Zero-footprint, top-most, non-interactive container; children opt back in.
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

  // Arm/disarm commands relayed from the service worker.
  chrome.runtime.onMessage.addListener((message: unknown) => {
    const command = message as ContentCommand;
    if (command.type === 'author.arm') arm();
    else if (command.type === 'author.disarm') disarm();
  });
}
