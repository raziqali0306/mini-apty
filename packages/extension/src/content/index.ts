/**
 * Content script — owns DOM access for this tab. It hosts the overlay inside a
 * closed Shadow DOM so host-page CSS/z-index/event handlers cannot break (or be
 * broken by) our UI. Capture listeners, the target resolver, and the
 * MutationObserver/polling loop attach here as features are built.
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
  // Future: render hover affordance (author) / step balloon (player) here,
  // with Tailwind styles scoped to this shadow root.
}
