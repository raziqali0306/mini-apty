import type { TargetDescriptor } from './types';
import { fingerprint } from './descriptor';

/**
 * Re-finds an element from a {@link TargetDescriptor} at play time. Gathers
 * candidates from each signal tier, scores them (attrs ≫ text > anchor ≫ layout),
 * and returns the best match only if it clears a threshold AND is unambiguous —
 * a wrong match is worse than none, so ties resolve to `null`.
 *
 * Descriptors come from storage/the backend and may be partial (older or
 * minimal captures), so every tier access is defensive.
 */
const SCORE_THRESHOLD = 20;
const AMBIGUITY_MARGIN = 6;
const MAX_TEXT_CANDIDATES = 50;

/** Flip to true to surface the targeting debug logs (tiers, scores, verdict). */
const DEBUG = false;
const log = (...args: unknown[]): void => {
  if (DEBUG) console.log('[mini-apty][resolver]', ...args);
};

export function resolveElement(d: TargetDescriptor): Element | null {
  log('looking for descriptor', JSON.stringify(d));

  const candidates = collectCandidates(d);
  log(`collected ${candidates.length} candidate(s)`, candidates.map(describeEl));
  if (candidates.length === 0) {
    log('NO CANDIDATES — none of the tiers (attr / anchor / text / fallback) matched anything on the page');
    return null;
  }

  const positional = collectPositionalMatches(d);
  const scored = candidates
    .map((el) => ({ el, score: scoreElement(el, d, positional) }))
    .sort((a, b) => b.score - a.score);
  log(
    'scored candidates (high→low)',
    scored.map((s) => ({ el: describeEl(s.el), score: s.score })),
  );

  const best = scored[0];
  if (!best || best.score < SCORE_THRESHOLD) {
    log(`REJECT — best score ${best?.score ?? 'n/a'} < threshold ${SCORE_THRESHOLD}`);
    return null;
  }

  const runnerUp = scored[1];
  if (runnerUp && runnerUp.el !== best.el && best.score - runnerUp.score < AMBIGUITY_MARGIN) {
    // The top candidates tie. If they're nested (one contains the other) they
    // point at the same place — text bubbles up so a wrapper matches as strongly
    // as the real target. Disambiguate by whose box best matches the captured
    // one rather than refusing. Only a tie between *unrelated* elements is real
    // ambiguity worth refusing.
    const tied = scored.filter((s) => best.score - s.score < AMBIGUITY_MARGIN).map((s) => s.el);
    if (isNestedChain(tied)) {
      const pick = closestToLayout(tied, d);
      log(`TIE among ${tied.length} nested element(s) → picked ${describeEl(pick)} by box match`);
      return pick;
    }
    log(
      `REJECT — ambiguous: best ${best.score} (${describeEl(best.el)}) vs runner-up ${runnerUp.score} ` +
        `(${describeEl(runnerUp.el)}); margin < ${AMBIGUITY_MARGIN}`,
    );
    return null; // genuinely ambiguous — refuse rather than guess wrong
  }
  log(`MATCH → ${describeEl(best.el)} (score ${best.score})`);
  return best.el;
}

/** Do the elements form a single ancestor chain (each contains the innermost)? */
function isNestedChain(els: Element[]): boolean {
  if (els.length <= 1) return true;
  const inner = els.reduce((a, b) => (depthOf(b) > depthOf(a) ? b : a));
  return els.every((e) => e === inner || e.contains(inner));
}

function depthOf(el: Element): number {
  let depth = 0;
  let cur: Element | null = el;
  while (cur) {
    depth += 1;
    cur = cur.parentElement;
  }
  return depth;
}

/** Among tied nested elements, the one whose box best matches the captured rect
 * (size dominates — it's stable across navigation; position is ~equal here). */
function closestToLayout(els: Element[], d: TargetDescriptor): Element {
  const r = d.layout?.rect;
  if (!r) return els.reduce((a, b) => (depthOf(b) > depthOf(a) ? b : a)); // innermost
  let best = els[0];
  let bestDist = Infinity;
  for (const el of els) {
    const b = el.getBoundingClientRect();
    const dist =
      Math.abs(b.x - r.x) +
      Math.abs(b.y - r.y) +
      Math.abs(b.width - r.width) +
      Math.abs(b.height - r.height);
    if (dist < bestDist) {
      bestDist = dist;
      best = el;
    }
  }
  return best;
}

/** Compact one-line description of an element for debug logs. */
function describeEl(el: Element): string {
  const id = el.id ? `#${el.id}` : '';
  const cls = el.classList.length ? `.${[...el.classList].slice(0, 3).join('.')}` : '';
  const text = norm(el.textContent).slice(0, 40);
  return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ''}`;
}

function collectCandidates(d: TargetDescriptor): Element[] {
  const set = new Set<Element>();

  const attrSelector = d.attrs?.selector;
  if (attrSelector) {
    const hits = safeQueryAll(attrSelector);
    log(`tier attr: selector "${attrSelector}" → ${hits.length}`, hits.map(describeEl));
    for (const el of hits) set.add(el);
  } else {
    log('tier attr: no stable-attribute selector on the descriptor');
  }

  const anchorSelector = d.anchor?.selector;
  if (anchorSelector) {
    const anchors = safeQueryAll(anchorSelector);
    const path = d.anchor?.pathFromAnchor;
    log(`tier anchor: "${anchorSelector}" → ${anchors.length} anchor(s), pathFromAnchor "${path ?? ''}"`);
    for (const anchor of anchors) {
      if (path) for (const el of safeQueryAll(path, anchor)) set.add(el);
      else set.add(anchor);
    }
  } else {
    log('tier anchor: no anchor selector on the descriptor');
  }

  const tag = d.text?.tag;
  const wanted = (d.text?.accessibleName ?? d.text?.normalized ?? '').trim().toLowerCase();
  if (tag && wanted) {
    let seen = 0;
    const before = set.size;
    for (const el of document.getElementsByTagName(tag)) {
      if (seen >= MAX_TEXT_CANDIDATES) break;
      const text = norm(el.textContent);
      if (text && (text === wanted || text.includes(wanted) || wanted.includes(text))) {
        set.add(el);
        seen += 1;
      }
    }
    log(`tier text: <${tag}> matching "${wanted}" → ${seen} (added ${set.size - before})`);
  } else {
    log('tier text: no tag/text on the descriptor');
  }

  if (set.size === 0 && d.fallbackCss) {
    const hits = safeQueryAll(d.fallbackCss);
    log(`tier fallback: cssPath "${d.fallbackCss}" → ${hits.length}`, hits.map(describeEl));
    for (const el of hits) set.add(el);
  }

  return [...set];
}

/**
 * Pre-resolved positional locators, computed once per resolve and shared across
 * candidates. These are precise-but-brittle paths: when one of them uniquely
 * picks an element, it's exactly the signal that separates otherwise-identical
 * candidates (e.g. three "Book a demo" links that match attrs/text/fingerprint
 * the same). Computed once because they're whole-document queries.
 */
interface PositionalMatches {
  /** Elements matched by anchor.selector + pathFromAnchor. */
  anchorPath: Set<Element>;
  /** Elements matched by the brittle fallbackCss path. */
  fallback: Set<Element>;
}

function collectPositionalMatches(d: TargetDescriptor): PositionalMatches {
  const anchorPath = new Set<Element>();
  const sel = d.anchor?.selector;
  const path = d.anchor?.pathFromAnchor;
  if (sel && path) {
    for (const anchor of safeQueryAll(sel)) {
      for (const el of safeQueryAll(path, anchor)) anchorPath.add(el);
    }
  }

  const fallback = new Set<Element>(d.fallbackCss ? safeQueryAll(d.fallbackCss) : []);
  return { anchorPath, fallback };
}

function scoreElement(el: Element, d: TargetDescriptor, positional: PositionalMatches): number {
  let score = 0;

  // Tier 1 — attributes (dominant).
  const a = d.attrs;
  if (a) {
    if (a.testId && attr(el, 'data-testid') === a.testId) score += 50;
    if (a.id && el.id === a.id) score += 40;
    if (a.name && attr(el, 'name') === a.name) score += 25;
    if (a.ariaLabel && attr(el, 'aria-label') === a.ariaLabel) score += 20;
    if (a.placeholder && attr(el, 'placeholder') === a.placeholder) score += 12;
    if (a.href && hrefPath(el) === a.href) score += 12;
    if (a.role && attr(el, 'role') === a.role) score += 8;
    if (a.type && attr(el, 'type') === a.type) score += 5;
    if (a.selector && safeMatches(el, a.selector)) score += 30;
  }

  // Tier 2 — text.
  const t = d.text;
  const text = norm(el.textContent);
  if (t) {
    if (t.tag && el.tagName.toLowerCase() === t.tag) score += 4;
    if (t.accessibleName && text && text === norm(t.accessibleName)) score += 16;
    else if (t.normalized && text && text === norm(t.normalized)) score += 10;
  }

  // Tier 3 — anchor. Being *inside* the stable ancestor is weak (shared by
  // siblings); matching the exact path *from* it is the strong disambiguator
  // that separates repeated identical CTAs.
  const an = d.anchor;
  if (an?.selector && safeClosest(el, an.selector)) score += 12;
  if (positional.anchorPath.has(el)) score += 18;

  // Associated <label> text — strong for inputs/selects that carry no text
  // content of their own; the label is what the user actually reads.
  if (an?.landmarkText) {
    const lm = landmarkTextOf(el);
    if (lm && norm(lm) === norm(an.landmarkText)) score += 12;
  }

  // Sibling index among same-tag siblings — weak positional tie-breaker (e.g.
  // the 2nd of three identical rows). Brittle, so low weight like layout.
  if (typeof an?.siblingIndex === 'number' && sameTagIndex(el) === an.siblingIndex) {
    score += 4;
  }

  // Fallback path — brittle, but when it uniquely matches it's a real tie-break.
  if (positional.fallback.has(el)) score += 8;

  // Fingerprint corroboration.
  if (d.fingerprint && fingerprint(el) === d.fingerprint) score += 10;

  // Layout — tie-breaker only (positions move).
  const rect = el.getBoundingClientRect();
  const layoutRect = d.layout?.rect;
  if (layoutRect) {
    const drift = Math.abs(rect.x - layoutRect.x) + Math.abs(rect.y - layoutRect.y);
    if (drift < 40) score += 6;
    else if (drift < 200) score += 2;
  }

  return score;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function attr(el: Element, name: string): string | null {
  return el.getAttribute(name);
}

/** Path-only href, matching how the descriptor captures `attrs.href`. */
function hrefPath(el: Element): string | undefined {
  const href = el.getAttribute('href');
  if (!href) return undefined;
  try {
    return new URL(href, location.href).pathname;
  } catch {
    return undefined;
  }
}

/** Text of the element's associated <label> — mirrors descriptor capture. */
function landmarkTextOf(el: Element): string | undefined {
  const id = el.getAttribute('id');
  if (id) {
    const label = safeQueryAll(`label[for="${cssEscape(id)}"]`)[0];
    if (label?.textContent) return norm(label.textContent) || undefined;
  }
  const wrapping = safeClosest(el, 'label');
  if (wrapping?.textContent) return norm(wrapping.textContent) || undefined;
  return undefined;
}

/** Index of `el` among its same-tag siblings — mirrors descriptor capture. */
function sameTagIndex(el: Element): number {
  const parent = el.parentElement;
  if (!parent) return 0;
  return Array.from(parent.children)
    .filter((c) => c.tagName === el.tagName)
    .indexOf(el);
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/["\\]/g, '\\$&');
}

function norm(text: string | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 80);
}

function safeQueryAll(selector: string, root: ParentNode = document): Element[] {
  try {
    return [...root.querySelectorAll(selector)];
  } catch {
    return [];
  }
}

function safeMatches(el: Element, selector: string): boolean {
  try {
    return el.matches(selector);
  } catch {
    return false;
  }
}

function safeClosest(el: Element, selector: string): Element | null {
  try {
    return el.closest(selector);
  } catch {
    return null;
  }
}
