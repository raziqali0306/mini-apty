import type { AdvanceTriggerKind, TargetDescriptor } from '../content/targeting/types';

/** A walkthrough as the player consumes it (target is the captured descriptor). */
export interface PlayerStep {
  order: number;
  title: string;
  description: string;
  target: TargetDescriptor;
  advanceTrigger: { kind: AdvanceTriggerKind };
}

export interface PlayerWalkthrough {
  id: string;
  name: string;
  origin: string;
  pathPattern: string;
  steps: PlayerStep[];
}

/** Persisted per origin so a refresh/return resumes at the right step. */
export interface PlayerSession {
  id: string;
  stepIndex: number;
}

const WT_PREFIX = 'mini-apty:wt:';
const PLAYER_PREFIX = 'mini-apty:player:';

/** Cache key for a full walkthrough (offline-once-loaded). */
export const walkthroughKey = (id: string): string => `${WT_PREFIX}${id}`;

/** Active-session key for an origin (which walkthrough + step is playing). */
export const playerKey = (origin: string): string => `${PLAYER_PREFIX}${origin}`;

/** Does a concrete path match a stored `*`-per-segment pattern? */
export function pathMatchesPattern(pattern: string, path: string): boolean {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const withWildcard = escaped.replace(/\\\*/g, '[^/]*');
  return new RegExp(`^${withWildcard}$`).test(path);
}
