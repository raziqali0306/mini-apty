import type { TargetDescriptor } from './types';

/**
 * Builds a multi-signal {@link TargetDescriptor} for an element at author time.
 * Pure DOM read — no mutation. The richer/more stable the capture, the better
 * the player's resolver can re-find the element across re-renders.
 */
export function buildDescriptor(el: Element): TargetDescriptor {
  const tag = el.tagName.toLowerCase();
  const rect = el.getBoundingClientRect();
  const anchor = nearestStableAnchor(el);
  const id = el.getAttribute('id');

  return {
    attrs: {
      selector: stableAttrSelector(el),
      testId: firstAttr(el, ['data-testid', 'data-test', 'data-qa']),
      id: id && !isGeneratedId(id) ? id : undefined,
      name: el.getAttribute('name') ?? undefined,
      ariaLabel: el.getAttribute('aria-label') ?? undefined,
      role: el.getAttribute('role') ?? undefined,
      type: el.getAttribute('type') ?? undefined,
      placeholder: el.getAttribute('placeholder') ?? undefined,
      href: hrefPath(el),
    },
    text: {
      normalized: normalize(el.textContent ?? '') || undefined,
      accessibleName: accessibleName(el),
      tag,
    },
    anchor: {
      selector: anchor.selector,
      pathFromAnchor: anchor.pathFromAnchor,
      siblingIndex: sameTagIndex(el),
      landmarkText: landmarkText(el),
    },
    layout: {
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      quadrant: quadrant(rect),
    },
    fallbackCss: cssPath(el),
    fingerprint: fingerprint(el),
    capturedUrl: location.href,
  };
}

// ── helpers ────────────────────────────────────────────────────────────────

const STABLE_ATTR_PARTS = ['name', 'aria-label', 'role', 'type', 'placeholder'] as const;

function esc(value: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/["\\]/g, '\\$&');
}

function firstAttr(el: Element, attrs: string[]): string | undefined {
  for (const a of attrs) {
    const v = el.getAttribute(a);
    if (v) return v;
  }
  return undefined;
}

/** Heuristic: treat ids that look framework/hash-generated as unstable. */
function isGeneratedId(id: string): boolean {
  if (id.length > 40) return true;
  if (/^\d/.test(id)) return true;
  if (/\d{4,}/.test(id)) return true; // long digit runs
  if (/[a-f0-9]{8,}/i.test(id)) return true; // hex hashes
  if (id.includes(':')) return true; // React useId, e.g. ":r3:"
  return false;
}

/** Stable-attribute CSS selector, deliberately excluding class names. */
function stableAttrSelector(el: Element): string | undefined {
  const tag = el.tagName.toLowerCase();

  const testId = firstAttr(el, ['data-testid', 'data-test', 'data-qa']);
  if (testId) {
    const attr = el.hasAttribute('data-testid')
      ? 'data-testid'
      : el.hasAttribute('data-test')
        ? 'data-test'
        : 'data-qa';
    return `${tag}[${attr}="${esc(testId)}"]`;
  }

  const id = el.getAttribute('id');
  if (id && !isGeneratedId(id)) return `${tag}#${esc(id)}`;

  const parts: string[] = [];
  for (const a of STABLE_ATTR_PARTS) {
    const v = el.getAttribute(a);
    if (v) parts.push(`[${a}="${esc(v)}"]`);
    if (parts.length >= 2) break;
  }
  return parts.length > 0 ? `${tag}${parts.join('')}` : undefined;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 80);
}

function accessibleName(el: Element): string | undefined {
  const aria = el.getAttribute('aria-label');
  if (aria?.trim()) return aria.trim();

  const labelledby = el.getAttribute('aria-labelledby');
  if (labelledby) {
    const ref = document.getElementById(labelledby);
    if (ref?.textContent) return normalize(ref.textContent) || undefined;
  }

  const fromAttr = el.getAttribute('alt') ?? el.getAttribute('placeholder') ?? el.getAttribute('title');
  if (fromAttr?.trim()) return fromAttr.trim();

  return normalize(el.textContent ?? '') || undefined;
}

/** nth-of-type segment, omitting the index when the tag is unique among siblings. */
function segmentFor(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const parent = el.parentElement;
  if (!parent) return tag;
  const sameTag = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
  if (sameTag.length === 1) return tag;
  return `${tag}:nth-of-type(${sameTag.indexOf(el) + 1})`;
}

function sameTagIndex(el: Element): number {
  const parent = el.parentElement;
  if (!parent) return 0;
  return Array.from(parent.children)
    .filter((c) => c.tagName === el.tagName)
    .indexOf(el);
}

/** Walk up to the nearest ancestor with a stable selector; record the path down. */
function nearestStableAnchor(el: Element): { selector?: string; pathFromAnchor?: string } {
  const segments = [segmentFor(el)];
  let cur = el.parentElement;
  while (cur && cur !== document.documentElement) {
    const selector = stableAttrSelector(cur);
    if (selector) return { selector, pathFromAnchor: [...segments].reverse().join(' > ') };
    segments.push(segmentFor(cur));
    cur = cur.parentElement;
  }
  return {};
}

function cssPath(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur !== document.documentElement) {
    parts.unshift(segmentFor(cur));
    cur = cur.parentElement;
  }
  return parts.join(' > ');
}

function landmarkText(el: Element): string | undefined {
  const id = el.getAttribute('id');
  if (id) {
    const label = document.querySelector(`label[for="${esc(id)}"]`);
    if (label?.textContent) return normalize(label.textContent) || undefined;
  }
  const wrapping = el.closest('label');
  if (wrapping?.textContent) return normalize(wrapping.textContent) || undefined;
  return undefined;
}

function hrefPath(el: Element): string | undefined {
  const href = el.getAttribute('href');
  if (!href) return undefined;
  try {
    return new URL(href, location.href).pathname;
  } catch {
    return undefined;
  }
}

function quadrant(rect: DOMRect): string {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const horizontal = cx < window.innerWidth / 2 ? 'left' : 'right';
  const vertical = cy < window.innerHeight / 2 ? 'top' : 'bottom';
  return `${vertical}-${horizontal}`;
}

export function fingerprint(el: Element): string {
  return [
    el.tagName.toLowerCase(),
    el.getAttribute('id') ?? '',
    el.getAttribute('name') ?? '',
    el.getAttribute('data-testid') ?? '',
    el.getAttribute('role') ?? '',
  ].join('|');
}
