import overlayCss from './overlay.css?inline';
import { buildDescriptor } from '../targeting/descriptor';
import { hasClickableTarget, hasEditableInput } from '../triggers';
import type { DraftStep } from '../targeting/types';

/**
 * Author-mode capture affordance. While armed it highlights the hovered element
 * and, on click, swallows the click (capture phase + stopImmediatePropagation so
 * the host page never reacts) and emits a captured step.
 */

const OVERLAY_HOST_ID = 'mini-apty-overlay-root';
const FLASH_MS = 300;

let armed = false;
let highlight: HTMLDivElement | undefined;
let label: HTMLDivElement | undefined;
let onCapture: ((step: DraftStep) => void) | undefined;

export function initAffordance(root: ShadowRoot, captureHandler: (step: DraftStep) => void): void {
  onCapture = captureHandler;

  const sheet = new CSSStyleSheet();
  sheet.replaceSync(overlayCss);
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];

  highlight = document.createElement('div');
  highlight.className = 'ma-highlight';
  highlight.style.display = 'none';

  label = document.createElement('div');
  label.className = 'ma-label';
  label.style.display = 'none';

  root.append(highlight, label);
}

export function arm(): void {
  if (armed) return;
  armed = true;
  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('click', onClick, true);
  document.documentElement.style.cursor = 'crosshair';
}

export function disarm(): void {
  if (!armed) return;
  armed = false;
  document.removeEventListener('mousemove', onMove, true);
  document.removeEventListener('click', onClick, true);
  document.documentElement.style.removeProperty('cursor');
  hide();
}

// ── internals ────────────────────────────────────────────────────────────────

function targetOf(e: Event): Element | undefined {
  const el = e.target;
  if (!(el instanceof Element)) return undefined;
  if (el.id === OVERLAY_HOST_ID) return undefined; // never select our own overlay
  return el;
}

function onMove(e: MouseEvent): void {
  const el = targetOf(e);
  if (el) showHighlight(el);
}

function onClick(e: MouseEvent): void {
  const el = targetOf(e);
  if (!el) return;
  // Swallow the selection click so the host page's handlers never fire.
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

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
