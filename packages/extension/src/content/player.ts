import { resolveElement } from './targeting/resolver';
import { initBalloon, showBalloon, hideBalloon, repositionBalloon } from './overlay/balloon';
import {
  playerKey,
  walkthroughKey,
  type PlayerSession,
  type PlayerStep,
  type PlayerWalkthrough,
} from '../shared/player';
import type { AdvanceTriggerKind } from './targeting/types';

/**
 * On-page player. Resolves each step's element (with retry/poll for async/SPA
 * renders), renders the balloon, advances on Back/Next or a click-target, and
 * persists progress so a refresh/reroute resumes at the right step.
 *
 * Progress is kept in **localStorage** (synchronous, so it survives a full-page
 * navigation a click may trigger), and a walkthrough resumes wherever its
 * current step's element appears — not by matching a path — so guided flows can
 * span routes. A MutationObserver re-anchors across re-renders; patched history
 * APIs re-evaluate on SPA route changes.
 */

const FAST_RETRY_MS = 400;
const FAST_RETRIES = 8;
const SLOW_POLL_MS = 1000;
const RESUME_PROBE_MS = 8000;
const LOCATION_CHANGE = 'mini-apty:locationchange';

interface ActivePlay {
  wt: PlayerWalkthrough;
  index: number;
}

let active: ActivePlay | null = null;
let anchoredEl: Element | null = null;
let pollTimer: number | undefined;
let triggerCleanup: (() => void) | undefined;
let observer: MutationObserver | undefined;
let observing = false;
let observerRaf = 0;
let historyPatched = false;

export function initPlayer(root: ShadowRoot): void {
  initBalloon(root);
  patchHistory();
  window.addEventListener(LOCATION_CHANGE, onLocationChange);
}

/** Start a freshly-seeded play (panel click) — the worker hands in the id. */
export function beginPlay(id: string): void {
  stopPlayer();
  writeProgress({ id, stepIndex: 0 });
  void startPlayerFromStorage();
}

/**
 * Resume from persisted progress (page load / navigation). Resumes only if the
 * current step's element appears on this page within a budget — so it follows a
 * flow across routes and stays quiet on unrelated pages.
 */
export async function startPlayerFromStorage(): Promise<void> {
  const progress = readProgress();
  if (!progress) return;
  const wt = await readWalkthrough(progress.id);
  if (!wt) return;
  const index = clamp(progress.stepIndex, wt.steps.length);
  const step = wt.steps[index];
  if (!step) {
    clearProgress();
    return;
  }
  const found = await probeForElement(step.target, RESUME_PROBE_MS);
  if (!found || active) return; // not here (yet), or another run started meanwhile
  active = { wt, index };
  renderStep();
}

export function stopPlayer(): void {
  active = null;
  anchoredEl = null;
  clearPoll();
  clearTrigger();
  clearObserver();
  hideBalloon();
}

function renderStep(): void {
  if (!active) return;
  clearPoll();
  clearTrigger();
  anchoredEl = null;

  const step = active.wt.steps[active.index];
  if (!step) {
    finish();
    return;
  }
  const isLast = active.index === active.wt.steps.length - 1;
  let announcedMissing = false;
  let attempts = 0;
  let scrolled = false;

  const tick = (): void => {
    if (!active) return;
    const found = safeResolve(step.target);

    if (found) {
      clearTrigger();
      anchoredEl = found;
      if (!scrolled) {
        scrolled = true;
        ensureVisible(found); // scroll to the element once, when the step shows
      }
      showBalloon(found, {
        index: active.index,
        total: active.wt.steps.length,
        title: step.title,
        description: step.description,
        canPrev: active.index > 0,
        showNext: step.advanceTrigger.kind !== 'click-target',
        nextLabel: isLast ? 'Finish' : 'Next',
        hint: triggerHint(step.advanceTrigger.kind),
        onPrev: prev,
        onNext: next,
        onClose: finish,
      });
      attachTrigger(step.advanceTrigger.kind, found);
      startObserving();
      return;
    }

    attempts += 1;
    if (attempts > FAST_RETRIES && !announcedMissing) {
      announcedMissing = true;
      anchoredEl = null;
      showBalloon(null, {
        index: active.index,
        total: active.wt.steps.length,
        title: step.title,
        description: step.description || 'Loading this step…',
        canPrev: active.index > 0,
        showNext: true, // never trap the user when the element is missing
        nextLabel: isLast ? 'Finish' : 'Skip',
        hint: 'Waiting for the element to appear…',
        onPrev: prev,
        onNext: next,
        onClose: finish,
      });
    }
    pollTimer = window.setTimeout(tick, attempts > FAST_RETRIES ? SLOW_POLL_MS : FAST_RETRY_MS);
  };

  tick();
}

function next(): void {
  if (!active) return;
  if (active.index >= active.wt.steps.length - 1) {
    finish();
    return;
  }
  active.index += 1;
  writeProgress({ id: active.wt.id, stepIndex: active.index });
  renderStep();
}

function prev(): void {
  if (!active || active.index === 0) return;
  active.index -= 1;
  writeProgress({ id: active.wt.id, stepIndex: active.index });
  renderStep();
}

function finish(): void {
  clearProgress();
  stopPlayer();
}

function attachTrigger(kind: AdvanceTriggerKind, target: Element): void {
  if (kind === 'click-target') {
    const handler = (): void => next();
    target.addEventListener('click', handler, true);
    triggerCleanup = () => target.removeEventListener('click', handler, true);
  }
  // 'next-button' and 'input-change' advance via the balloon's Next button — no
  // page listener (input-change must not advance on every keystroke).
}

function triggerHint(kind: AdvanceTriggerKind): string | undefined {
  if (kind === 'click-target') return 'Click the highlighted element to continue.';
  if (kind === 'input-change') return 'Fill in the field, then click Next.';
  return undefined;
}

/** Scroll an off-screen element into view once (e.g. a step at the page bottom). */
function ensureVisible(el: Element): void {
  const r = el.getBoundingClientRect();
  const fullyVisible =
    r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth;
  if (!fullyVisible) {
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  }
}

/** Poll for an element up to a budget (used to decide whether to resume here). */
function probeForElement(target: PlayerStep['target'], budgetMs: number): Promise<Element | null> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = (): void => {
      const el = safeResolve(target);
      if (el) {
        resolve(el);
        return;
      }
      if (Date.now() - start >= budgetMs) {
        resolve(null);
        return;
      }
      window.setTimeout(tick, 300);
    };
    tick();
  });
}

// ── SPA / mutation resilience ─────────────────────────────────────────────────

function startObserving(): void {
  if (!observer) observer = new MutationObserver(onMutation);
  if (observing) return;
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
  observing = true;
}

function clearObserver(): void {
  observer?.disconnect();
  observing = false;
  cancelAnimationFrame(observerRaf);
}

function onMutation(): void {
  cancelAnimationFrame(observerRaf);
  observerRaf = requestAnimationFrame(() => {
    if (!active || !anchoredEl) return;
    if (!anchoredEl.isConnected) renderStep();
    else repositionBalloon();
  });
}

function patchHistory(): void {
  if (historyPatched) return;
  historyPatched = true;
  const fire = (): void => {
    window.dispatchEvent(new Event(LOCATION_CHANGE));
  };

  const origPush = history.pushState.bind(history);
  history.pushState = (...args: Parameters<History['pushState']>): void => {
    origPush(...args);
    fire();
  };
  const origReplace = history.replaceState.bind(history);
  history.replaceState = (...args: Parameters<History['replaceState']>): void => {
    origReplace(...args);
    fire();
  };
  window.addEventListener('popstate', fire);
}

/** On SPA navigation: keep an active run going (re-resolve the current step on
 * the new view); otherwise try to resume from persisted progress. */
function onLocationChange(): void {
  clearPoll();
  clearTrigger();
  clearObserver();
  anchoredEl = null;
  if (active) {
    renderStep();
    return;
  }
  hideBalloon();
  void startPlayerFromStorage();
}

/** Resolution must never crash the host page — treat any failure as "not found". */
function safeResolve(target: PlayerStep['target']): Element | null {
  try {
    return resolveElement(target);
  } catch (err) {
    console.warn('[mini-apty] resolver error', err);
    return null;
  }
}

function clearPoll(): void {
  if (pollTimer !== undefined) {
    window.clearTimeout(pollTimer);
    pollTimer = undefined;
  }
}

function clearTrigger(): void {
  triggerCleanup?.();
  triggerCleanup = undefined;
}

function clamp(index: number, length: number): number {
  if (length === 0) return 0;
  return Math.min(Math.max(0, index), length - 1);
}

// ── persistence ───────────────────────────────────────────────────────────────

/** Progress lives in localStorage: synchronous, so it's saved before a click's
 * navigation unloads the page. Keyed per origin. */
function writeProgress(session: PlayerSession): void {
  try {
    localStorage.setItem(playerKey(location.origin), JSON.stringify(session));
  } catch {
    /* storage may be blocked on some pages */
  }
}

function readProgress(): PlayerSession | undefined {
  try {
    const raw = localStorage.getItem(playerKey(location.origin));
    return raw ? (JSON.parse(raw) as PlayerSession) : undefined;
  } catch {
    return undefined;
  }
}

function clearProgress(): void {
  try {
    localStorage.removeItem(playerKey(location.origin));
  } catch {
    /* ignore */
  }
}

/** The full walkthrough body is cached by the worker in chrome.storage.local. */
async function readWalkthrough(id: string): Promise<PlayerWalkthrough | undefined> {
  const key = walkthroughKey(id);
  const result = await chrome.storage.local.get(key);
  return result[key] as PlayerWalkthrough | undefined;
}
