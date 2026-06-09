/**
 * The on-page player balloon (rendered in the closed shadow root). Anchors to
 * the current step's element with a spotlight ring, shows title/description +
 * Back/Next/Close, and repositions on scroll/resize. Vanilla DOM — no React in
 * the content script.
 */

export interface BalloonControls {
  index: number;
  total: number;
  title: string;
  description: string;
  canPrev: boolean;
  nextLabel: string;
  hint?: string;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

let ring: HTMLDivElement | undefined;
let card: HTMLDivElement | undefined;
let titleEl: HTMLDivElement | undefined;
let descEl: HTMLDivElement | undefined;
let hintEl: HTMLDivElement | undefined;
let counterEl: HTMLSpanElement | undefined;
let prevBtn: HTMLButtonElement | undefined;
let nextBtn: HTMLButtonElement | undefined;
let closeBtn: HTMLButtonElement | undefined;

let currentTarget: Element | null = null;
let repositionListener: (() => void) | undefined;

export function initBalloon(root: ShadowRoot): void {
  ring = el('div', 'ma-ring');
  ring.style.display = 'none';

  titleEl = el('div', 'ma-balloon-title');
  descEl = el('div', 'ma-balloon-desc');
  hintEl = el('div', 'ma-balloon-hint');
  counterEl = el('span', 'ma-counter');
  prevBtn = el('button', 'ma-btn');
  prevBtn.textContent = 'Back';
  nextBtn = el('button', 'ma-btn ma-btn-primary');
  nextBtn.textContent = 'Next';
  closeBtn = el('button', 'ma-close');
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', 'Close');

  const foot = el('div', 'ma-balloon-foot');
  foot.append(prevBtn, counterEl, nextBtn);

  card = el('div', 'ma-balloon');
  card.style.display = 'none';
  card.append(closeBtn, titleEl, descEl, hintEl, foot);

  root.append(ring, card);
}

export function showBalloon(target: Element | null, c: BalloonControls): void {
  if (!card || !titleEl || !descEl || !hintEl || !counterEl || !prevBtn || !nextBtn || !closeBtn) {
    return;
  }
  currentTarget = target;

  titleEl.textContent = c.title || `Step ${c.index + 1}`;
  descEl.textContent = c.description;
  descEl.style.display = c.description ? 'block' : 'none';
  hintEl.textContent = c.hint ?? '';
  hintEl.style.display = c.hint ? 'block' : 'none';
  counterEl.textContent = `${c.index + 1} / ${c.total}`;
  prevBtn.disabled = !c.canPrev;
  nextBtn.textContent = c.nextLabel;

  prevBtn.onclick = c.onPrev;
  nextBtn.onclick = c.onNext;
  closeBtn.onclick = c.onClose;

  card.style.display = 'block';
  reposition();
  attachReposition();
}

export function hideBalloon(): void {
  currentTarget = null;
  if (ring) ring.style.display = 'none';
  if (card) card.style.display = 'none';
  detachReposition();
}

/** Re-anchor to the current target — used after DOM mutations move it. */
export function repositionBalloon(): void {
  reposition();
}

function reposition(): void {
  if (!ring || !card) return;

  if (!currentTarget) {
    ring.style.display = 'none';
    card.style.left = `${Math.round(window.innerWidth / 2 - 145)}px`;
    card.style.top = `${Math.round(window.innerHeight / 2 - 70)}px`;
    return;
  }

  const r = currentTarget.getBoundingClientRect();
  if (r.top < 0 || r.bottom > window.innerHeight) {
    currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  ring.style.display = 'block';
  ring.style.top = `${r.top - 3}px`;
  ring.style.left = `${r.left - 3}px`;
  ring.style.width = `${r.width + 6}px`;
  ring.style.height = `${r.height + 6}px`;

  const cardHeight = card.offsetHeight || 140;
  const below = window.innerHeight - r.bottom > cardHeight + 16;
  const top = below ? r.bottom + 10 : Math.max(8, r.top - cardHeight - 10);
  const left = Math.min(Math.max(8, r.left), window.innerWidth - 298);
  card.style.top = `${Math.round(top)}px`;
  card.style.left = `${Math.round(left)}px`;
}

function attachReposition(): void {
  if (repositionListener) return;
  let raf = 0;
  repositionListener = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(reposition);
  };
  window.addEventListener('scroll', repositionListener, true);
  window.addEventListener('resize', repositionListener);
}

function detachReposition(): void {
  if (!repositionListener) return;
  window.removeEventListener('scroll', repositionListener, true);
  window.removeEventListener('resize', repositionListener);
  repositionListener = undefined;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}
