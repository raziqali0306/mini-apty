import { create } from 'zustand';

/** Which view the authenticated side panel is showing. */
export type Mode = 'home' | 'author' | 'preview';

interface AppState {
  mode: Mode;
  setMode: (mode: Mode) => void;
}

/**
 * Presentational navigation state for the panel. Side effects (Port RPCs, API
 * calls) live in dedicated hooks/stores so views stay pure.
 */
export const useAppStore = create<AppState>((set) => ({
  mode: 'home',
  setMode: (mode) => set({ mode }),
}));
