/**
 * The Port message contract between the side panel and the service worker.
 * Kept as a discriminated union so both ends stay in sync under strict TS.
 * This is a skeleton — auth/author/player RPCs land here as features are built.
 */
export const PANEL_PORT = 'panel';

export type PanelToWorker = { type: 'ping'; t: number };

export type WorkerToPanel =
  | { type: 'pong'; t: number }
  | { type: 'auth.expired' };

export type PanelPortMessage = PanelToWorker | WorkerToPanel;
