/** Advance-trigger kinds from the brief. v1 reuses the captured element. */
export type AdvanceTriggerKind = 'next-button' | 'click-target' | 'input-change';

export const ADVANCE_TRIGGER_KINDS: readonly AdvanceTriggerKind[] = [
  'next-button',
  'click-target',
  'input-change',
];

/**
 * Multi-signal target descriptor captured at author time. Stored opaquely by
 * the backend; the player's scoring resolver consumes these tiers later.
 * Weighting (player): attrs ≫ text > anchor ≫ layout; fallbackCss is last resort.
 */
export interface TargetDescriptor {
  attrs: {
    /** Stable-attribute CSS selector (no hashed/utility classes). */
    selector?: string;
    testId?: string;
    id?: string;
    name?: string;
    ariaLabel?: string;
    role?: string;
    type?: string;
    placeholder?: string;
    /** Path-only href for links. */
    href?: string;
  };
  text: {
    normalized?: string;
    accessibleName?: string;
    tag: string;
  };
  anchor: {
    /** Nearest ancestor with a stable attribute. */
    selector?: string;
    /** CSS path from that anchor down to the target. */
    pathFromAnchor?: string;
    siblingIndex?: number;
    landmarkText?: string;
  };
  layout: {
    rect: { x: number; y: number; width: number; height: number };
    quadrant: string;
  };
  /** Brittle absolute-ish path — last-resort signal only. */
  fallbackCss: string;
  fingerprint: string;
  capturedUrl: string;
}

/** Which advance triggers the captured element supports (author-time gating). */
export interface StepCapabilities {
  clickTarget: boolean;
  inputChange: boolean;
}

/** A step as captured/edited in the panel before save. */
export interface DraftStep {
  tempId: string;
  order: number;
  title: string;
  description: string;
  /** The trigger fires on the captured element itself (events bubble from descendants). */
  advanceTrigger: AdvanceTriggerKind;
  target: TargetDescriptor;
  /** Author-time only — not persisted to the backend. */
  capabilities: StepCapabilities;
}
