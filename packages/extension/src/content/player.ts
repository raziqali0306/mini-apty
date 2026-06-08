import { resolveElement } from './targeting/resolver';
import { initBalloon, showBalloon, hideBalloon } from './overlay/balloon';
import {
  playerKey,
  walkthroughKey,
  pathMatchesPattern,
  type PlayerSession,
  type PlayerStep,
  type PlayerWalkthrough,
} from '../shared/player';
import type { AdvanceTriggerKind } from './targeting/types';

/**
 * On-page player. Resolves each step's element (with retry/poll for async/SPA
 * renders), renders the balloon, advances on Back/Next or the configured
 * trigger, and persists progress so a refresh/return resumes at the right step.
 */

const FAST_RETRY_MS = 400;
const FAST_RETRIES = 8;
const SLOW_POLL_MS = 1000;

interface ActivePlay {
  wt: PlayerWalkthrough;
  index: number;
}

let active: ActivePlay | null = null;
let pollTimer: number | undefined;
let triggerCleanup: (() => void) | undefined;

export function initPlayer(root: ShadowRoot): void {
  initBalloon(root);
}

/** Start (or resume) from the persisted session — used on page load and on play. */
export async function startPlayerFromStorage(): Promise<void> {
  const session = await readSession();
  if (!session) return;
  const wt = await readWalkthrough(session.id);
  if (!wt) return;
  // Only play on a page the walkthrough actually targets.
  if (!pathMatchesPattern(wt.pathPattern, location.pathname)) return;

  active = { wt, index: clamp(session.stepIndex, wt.steps.length) };
  renderStep();
}

export function stopPlayer(): void {
  active = null;
  clearPoll();
  clearTrigger();
  hideBalloon();
}

function renderStep(): void {
  if (!active) return;
  clearPoll();
  clearTrigger();

  const step = active.wt.steps[active.index];
  if (!step) {
    void finish();
    return;
  }
  const isLast = active.index === active.wt.steps.length - 1;
  let announcedMissing = false;
  let attempts = 0;

  const tick = (): void => {
    if (!active) return;
    const found = safeResolve(step.target);

    if (found) {
      clearTrigger();
      showBalloon(found, {
        index: active.index,
        total: active.wt.steps.length,
        title: step.title,
        description: step.description,
        canPrev: active.index > 0,
        nextLabel: isLast ? 'Finish' : 'Next',
        hint: triggerHint(step.advanceTrigger.kind),
        onPrev: prev,
        onNext: next,
        onClose: () => void finish(),
      });
      attachTrigger(step.advanceTrigger.kind, found);
      return;
    }

    attempts += 1;
    if (attempts > FAST_RETRIES && !announcedMissing) {
      announcedMissing = true;
      // Degraded balloon — never block; allow Skip/End. Keep polling in case the
      // element renders late (SPA), which re-attaches automatically.
      showBalloon(null, {
        index: active.index,
        total: active.wt.steps.length,
        title: step.title,
        description: step.description || "Couldn't find this step's element on the page.",
        canPrev: active.index > 0,
        nextLabel: isLast ? 'Finish' : 'Skip',
        hint: 'Waiting for the element to appear…',
        onPrev: prev,
        onNext: next,
        onClose: () => void finish(),
      });
    }
    pollTimer = window.setTimeout(tick, attempts > FAST_RETRIES ? SLOW_POLL_MS : FAST_RETRY_MS);
  };

  tick();
}

function next(): void {
  if (!active) return;
  if (active.index >= active.wt.steps.length - 1) {
    void finish();
    return;
  }
  active.index += 1;
  void persist();
  renderStep();
}

function prev(): void {
  if (!active || active.index === 0) return;
  active.index -= 1;
  void persist();
  renderStep();
}

async function finish(): Promise<void> {
  await clearSession();
  stopPlayer();
}

function attachTrigger(kind: AdvanceTriggerKind, target: Element): void {
  if (kind === 'click-target') {
    const handler = (): void => next();
    target.addEventListener('click', handler, true);
    triggerCleanup = () => target.removeEventListener('click', handler, true);
  } else if (kind === 'input-change') {
    const handler = (): void => next();
    target.addEventListener('input', handler, true);
    target.addEventListener('change', handler, true);
    triggerCleanup = () => {
      target.removeEventListener('input', handler, true);
      target.removeEventListener('change', handler, true);
    };
  }
  // 'next-button' has no page trigger — the balloon's Next handles it.
}

function triggerHint(kind: AdvanceTriggerKind): string | undefined {
  if (kind === 'click-target') return 'Click the highlighted element to continue.';
  if (kind === 'input-change') return 'Change the highlighted field to continue.';
  return undefined;
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

// ── persistence (content scripts can read/write chrome.storage.local) ─────────

async function readSession(): Promise<PlayerSession | undefined> {
  const key = playerKey(location.origin);
  const result = await chrome.storage.local.get(key);
  return result[key] as PlayerSession | undefined;
}

async function readWalkthrough(id: string): Promise<PlayerWalkthrough | undefined> {
  const key = walkthroughKey(id);
  const result = await chrome.storage.local.get(key);
  return result[key] as PlayerWalkthrough | undefined;
}

async function persist(): Promise<void> {
  if (!active) return;
  await chrome.storage.local.set({
    [playerKey(location.origin)]: { id: active.wt.id, stepIndex: active.index } satisfies PlayerSession,
  });
}

async function clearSession(): Promise<void> {
  await chrome.storage.local.remove(playerKey(location.origin));
}
