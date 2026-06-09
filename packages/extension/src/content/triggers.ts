/**
 * Author-time capability checks that gate which advance triggers a captured
 * element supports: `click-target` needs something clickable (self or descendant),
 * `input-change` needs a non-disabled input field. The trigger fires on the
 * captured element at play time (events bubble from descendants), so these just
 * decide which options the author may pick.
 */

const CLICKABLE_SELECTOR = [
  'button',
  'a[href]',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="option"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[onclick]',
  '[tabindex]',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="reset"]',
].join(',');

const EDITABLE_SELECTOR = [
  'input:not([disabled]):not([type="hidden"])',
  'textarea:not([disabled])',
  'select:not([disabled])',
].join(',');

function matchesSafe(el: Element, selector: string): boolean {
  try {
    return el.matches(selector);
  } catch {
    return false;
  }
}

function querySafe(el: Element, selector: string): boolean {
  try {
    return el.querySelector(selector) !== null;
  } catch {
    return false;
  }
}

/** True if the element itself looks clickable (explicit markup or pointer cursor). */
function isClickable(el: Element): boolean {
  if (matchesSafe(el, CLICKABLE_SELECTOR)) return true;
  try {
    // Catches styled <div>/<span> with JS click handlers that open forms etc.
    if (getComputedStyle(el).cursor === 'pointer') return true;
  } catch {
    /* getComputedStyle can throw on detached nodes */
  }
  return false;
}

export function hasClickableTarget(el: Element): boolean {
  return isClickable(el) || querySafe(el, CLICKABLE_SELECTOR);
}

export function hasEditableInput(el: Element): boolean {
  return matchesSafe(el, EDITABLE_SELECTOR) || querySafe(el, EDITABLE_SELECTOR);
}
