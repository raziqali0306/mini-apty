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

export function resolveElement(d: TargetDescriptor): Element | null {
  const candidates = collectCandidates(d);
  if (candidates.length === 0) return null;

  const scored = candidates
    .map((el) => ({ el, score: scoreElement(el, d) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < SCORE_THRESHOLD) return null;

  const runnerUp = scored[1];
  if (runnerUp && runnerUp.el !== best.el && best.score - runnerUp.score < AMBIGUITY_MARGIN) {
    return null; // genuinely ambiguous — refuse rather than guess wrong
  }
  return best.el;
}

function collectCandidates(d: TargetDescriptor): Element[] {
  const set = new Set<Element>();

  const attrSelector = d.attrs?.selector;
  if (attrSelector) for (const el of safeQueryAll(attrSelector)) set.add(el);

  const anchorSelector = d.anchor?.selector;
  if (anchorSelector) {
    for (const anchor of safeQueryAll(anchorSelector)) {
      const path = d.anchor?.pathFromAnchor;
      if (path) for (const el of safeQueryAll(path, anchor)) set.add(el);
      else set.add(anchor);
    }
  }

  const tag = d.text?.tag;
  const wanted = (d.text?.accessibleName ?? d.text?.normalized ?? '').trim().toLowerCase();
  if (tag && wanted) {
    let seen = 0;
    for (const el of document.getElementsByTagName(tag)) {
      if (seen >= MAX_TEXT_CANDIDATES) break;
      const text = norm(el.textContent);
      if (text && (text === wanted || text.includes(wanted) || wanted.includes(text))) {
        set.add(el);
        seen += 1;
      }
    }
  }

  if (set.size === 0 && d.fallbackCss) for (const el of safeQueryAll(d.fallbackCss)) set.add(el);

  return [...set];
}

function scoreElement(el: Element, d: TargetDescriptor): number {
  let score = 0;

  // Tier 1 — attributes (dominant).
  const a = d.attrs;
  if (a) {
    if (a.testId && attr(el, 'data-testid') === a.testId) score += 50;
    if (a.id && el.id === a.id) score += 40;
    if (a.name && attr(el, 'name') === a.name) score += 25;
    if (a.ariaLabel && attr(el, 'aria-label') === a.ariaLabel) score += 20;
    if (a.placeholder && attr(el, 'placeholder') === a.placeholder) score += 12;
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

  // Tier 3 — anchor.
  if (d.anchor?.selector && safeClosest(el, d.anchor.selector)) score += 12;

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
