import { create } from 'zustand';
import { portClient } from '../lib/port-client';
import type { ApiError, AuthorContext, SaveWalkthroughInput } from '../shared/messages';
import type { DraftStep } from '../content/targeting/types';

type SaveStatus = 'idle' | 'saving' | 'saved';

type StepPatch = Partial<Pick<DraftStep, 'title' | 'description' | 'advanceTrigger'>>;

interface AuthorState {
  recording: boolean;
  starting: boolean;
  steps: DraftStep[];
  context: AuthorContext | null;
  name: string;
  pattern: string;
  saveStatus: SaveStatus;
  error: ApiError | null;

  loadContext: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  addStep: (step: DraftStep) => void;
  updateStep: (tempId: string, patch: StepPatch) => void;
  removeStep: (tempId: string) => void;
  setName: (name: string) => void;
  setPattern: (pattern: string) => void;
  save: () => Promise<void>;
  reset: () => void;
  clearError: () => void;
}

export const useAuthorStore = create<AuthorState>((set, get) => ({
  recording: false,
  starting: false,
  steps: [],
  context: null,
  name: '',
  pattern: '',
  saveStatus: 'idle',
  error: null,

  loadContext: async () => {
    try {
      const context = await portClient.request('author.context');
      set((s) => ({ context, pattern: s.pattern || context.suggestedPattern }));
    } catch (err) {
      set({ error: err as ApiError });
    }
  },

  start: async () => {
    set({ error: null, starting: true });
    try {
      await portClient.request('author.start');
      set({ recording: true, starting: false });
    } catch (err) {
      set({ error: err as ApiError, starting: false });
    }
  },

  stop: async () => {
    try {
      await portClient.request('author.stop');
    } catch {
      // Stopping is best-effort; clear local state regardless.
    }
    set({ recording: false });
  },

  addStep: (step) =>
    set((s) => ({ steps: [...s.steps, { ...step, order: s.steps.length }], saveStatus: 'idle' })),

  updateStep: (tempId, patch) =>
    set((s) => ({ steps: s.steps.map((st) => (st.tempId === tempId ? { ...st, ...patch } : st)) })),

  removeStep: (tempId) =>
    set((s) => ({
      steps: s.steps.filter((st) => st.tempId !== tempId).map((st, i) => ({ ...st, order: i })),
    })),

  setName: (name) => set({ name }),
  setPattern: (pattern) => set({ pattern }),

  save: async () => {
    const { name, pattern, steps, context } = get();
    if (!context) {
      set({ error: { kind: 'unknown', message: 'No page context to save against' } });
      return;
    }
    if (steps.length === 0) {
      set({ error: { kind: 'validation', message: 'Capture at least one step first' } });
      return;
    }

    set({ saveStatus: 'saving', error: null });
    const payload: SaveWalkthroughInput = {
      name: name.trim() || 'Untitled walkthrough',
      origin: context.origin,
      pathPattern: pattern.trim() || context.path,
      steps: steps.map((st, i) => ({
        order: i,
        title: st.title.trim() || `Step ${i + 1}`,
        description: st.description.trim(),
        target: st.target,
        advanceTrigger: { kind: st.advanceTrigger },
      })),
    };

    try {
      await portClient.request('walkthrough.save', payload);
      set({ saveStatus: 'saved' });
    } catch (err) {
      set({ saveStatus: 'idle', error: err as ApiError });
    }
  },

  reset: () =>
    set({ recording: false, steps: [], name: '', pattern: '', saveStatus: 'idle', error: null }),

  clearError: () => set({ error: null }),
}));

// Captured steps arrive as worker events; fold them into the store.
portClient.onEvent((event) => {
  if (event.type === 'author.captured') {
    useAuthorStore.getState().addStep(event.step);
  }
});
