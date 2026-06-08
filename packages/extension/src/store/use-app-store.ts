import { create } from 'zustand';

/** UI mode for the side panel. Drives which view is shown. */
export type Mode = 'idle' | 'author' | 'player';

interface AppState {
  mode: Mode;
  setMode: (mode: Mode) => void;
}

/**
 * Presentational state lives here; side effects (Port RPCs, API calls) belong
 * in dedicated hooks/services so views stay pure. Auth + walkthrough slices are
 * added as features land.
 */
export const useAppStore = create<AppState>((set) => ({
  mode: 'idle',
  setMode: (mode) => set({ mode }),
}));
