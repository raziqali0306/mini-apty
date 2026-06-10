import overlayCss from './overlay.css?inline';
import { buildDescriptor } from '../targeting/descriptor';
import { hasClickableTarget, hasEditableInput } from '../triggers';
import type { DraftStep } from '../targeting/types';

/**
 * Author-mode capture affordance. While armed it lays a transparent full-viewport
 * shield over the page so every pointer event is ours — the host page never
 * reacts — and resolves the element *under the cursor* geometrically with
 * `elementsFromPoint`. That geometry-based hit test (rather than `event.target`)
 * is what lets us highlight and capture elements that don't dispatch mouse events
 * themselves, e.g. `disabled` inputs.
 */

const OVERLAY_HOST_ID = 'mini-apty-overlay-root';
const FLASH_MS = 300;

let armed = false;
let shield: HTMLDivElement | undefined;
let highlight: HTMLDivElement | undefined;
let label: HTMLDivElement | undefined;
let onCapture: ((step: DraftStep) => void) | undefined;

export function initAffordance(root: ShadowRoot, captureHandler: (step: DraftStep) => void): void {
  onCapture = captureHandler;

  const sheet = new CSSStyleSheet();
  sheet.replaceSync(overlayCss);
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];

  shield = document.createElement('div');
  shield.className = 'ma-shield';
  shield.style.display = 'none';

  highlight = document.createElement('div');
  highlight.className = 'ma-highlight';
  highlight.style.display = 'none';

  label = document.createElement('div');
  label.className = 'ma-label';
  label.style.display = 'none';

  root.append(shield, highlight, label);
}

export function arm(): void {
  if (armed || !shield) return;
  armed = true;
  shield.style.display = 'block';
  shield.addEventListener('mousemove', onMove, true);
  shield.addEventListener('click', onClick, true);
}

export function disarm(): void {
  if (!armed) return;
  armed = false;
  shield?.removeEventListener('mousemove', onMove, true);
  shield?.removeEventListener('click', onClick, true);
  if (shield) shield.style.display = 'none';
  hide();
}

// ── internals ────────────────────────────────────────────────────────────────

/**
 * Topmost host-page element at a viewport point, skipping our own overlay. Uses
 * `elementsFromPoint` (pure geometry) so it returns elements that swallow mouse
 * events — `disabled` inputs included — which `event.target` never would.
 */
function hostElementAt(x: number, y: number): Element | undefined {
  for (const el of document.elementsFromPoint(x, y)) {
    if (el.id === OVERLAY_HOST_ID) continue; // skip our shadow host (shield/ring)
    return el;
  }
  return undefined;
}

function onMove(e: MouseEvent): void {
  const el = hostElementAt(e.clientX, e.clientY);
  if (el) showHighlight(el);
  else hide();
}

function onClick(e: MouseEvent): void {
  // The shield already keeps the host page from reacting; belt-and-braces.
  e.preventDefault();
  e.stopPropagation();
  const el = hostElementAt(e.clientX, e.clientY);
  if (!el) return;

  const step: DraftStep = {
    tempId: uuid(),
    order: 0, // assigned by the store on insert
    title: defaultTitle(el),
    description: '',
    advanceTrigger: 'next-button',
    target: buildDescriptor(el),
    capabilities: {
      clickTarget: hasClickableTarget(el),
      inputChange: hasEditableInput(el),
    },
  };
  onCapture?.(step);
  flash();
}

function showHighlight(el: Element): void {
  if (!highlight || !label) return;
  const r = el.getBoundingClientRect();
  highlight.style.display = 'block';
  highlight.style.top = `${r.top}px`;
  highlight.style.left = `${r.left}px`;
  highlight.style.width = `${r.width}px`;
  highlight.style.height = `${r.height}px`;

  label.textContent = describe(el);
  label.style.display = 'block';
  label.style.top = `${Math.max(0, r.top - 22)}px`;
  label.style.left = `${r.left}px`;
}

function hide(): void {
  if (highlight) highlight.style.display = 'none';
  if (label) label.style.display = 'none';
}

function flash(): void {
  if (!highlight) return;
  highlight.classList.add('ma-flash');
  window.setTimeout(() => highlight?.classList.remove('ma-flash'), FLASH_MS);
}

function describe(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const testId = el.getAttribute('data-testid');
  if (testId) return `${tag}[data-testid="${testId}"]`;
  const id = el.getAttribute('id');
  if (id) return `${tag}#${id}`;
  const text = clip(el.textContent ?? '', 24);
  return text ? `${tag} "${text}"` : tag;
}

function defaultTitle(el: Element): string {
  const name = el.getAttribute('aria-label') ?? clip(el.textContent ?? '', 60);
  return name || el.tagName.toLowerCase();
}

function clip(text: string, max: number): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, max);
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // crypto.randomUUID needs a secure context; fall back on plain http pages.
  return `s-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}
