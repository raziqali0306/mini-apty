import { create } from 'zustand';
import { portClient } from '../lib/port-client';
import type { ApiError, AuthorContext, SaveWalkthroughInput } from '../shared/messages';
import type { PlayerWalkthrough } from '../shared/player';
import type { DraftStep } from '../content/targeting/types';

type SaveStatus = 'idle' | 'saving' | 'saved';

type StepPatch = Partial<Pick<DraftStep, 'title' | 'description' | 'advanceTrigger'>>;

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `e-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

interface AuthorState {
  recording: boolean;
  starting: boolean;
  steps: DraftStep[];
  context: AuthorContext | null;
  name: string;
  pattern: string;
  /** Set when editing an existing walkthrough (save → PUT instead of POST). */
  editingId: string | null;
  saveStatus: SaveStatus;
  /** True when the last save only persisted locally (backend unreachable). */
  savedOffline: boolean;
  error: ApiError | null;

  loadContext: () => Promise<void>;
  loadForEdit: (walkthrough: PlayerWalkthrough) => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  addStep: (step: DraftStep) => void;
  updateStep: (tempId: string, patch: StepPatch) => void;
  moveStep: (tempId: string, direction: -1 | 1) => void;
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
  editingId: null,
  saveStatus: 'idle',
  savedOffline: false,
  error: null,

  loadContext: async () => {
    try {
      const context = await portClient.request('author.context');
      set((s) => ({ context, pattern: s.pattern || context.suggestedPattern }));
    } catch (err) {
      set({ error: err as ApiError });
    }
  },

  loadForEdit: (walkthrough) =>
    set({
      editingId: walkthrough.id,
      name: walkthrough.name,
      pattern: walkthrough.pathPattern,
      context: {
        origin: walkthrough.origin,
        path: walkthrough.pathPattern,
        suggestedPattern: walkthrough.pathPattern,
      },
      steps: walkthrough.steps.map((s, i) => ({
        tempId: uuid(),
        order: i,
        title: s.title,
        description: s.description,
        advanceTrigger: s.advanceTrigger.kind,
        target: s.target,
        // Capabilities can't be recomputed off-page — allow any kind while editing.
        capabilities: { clickTarget: true, inputChange: true },
      })),
      recording: false,
      starting: false,
      saveStatus: 'idle',
      savedOffline: false,
      error: null,
    }),

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

  moveStep: (tempId, direction) =>
    set((s) => {
      const idx = s.steps.findIndex((st) => st.tempId === tempId);
      const target = idx + direction;
      if (idx < 0 || target < 0 || target >= s.steps.length) return {};
      const steps = [...s.steps];
      const [moved] = steps.splice(idx, 1);
      steps.splice(target, 0, moved);
      return { steps: steps.map((st, i) => ({ ...st, order: i })) };
    }),

  removeStep: (tempId) =>
    set((s) => ({
      steps: s.steps.filter((st) => st.tempId !== tempId).map((st, i) => ({ ...st, order: i })),
    })),

  setName: (name) => set({ name }),
  setPattern: (pattern) => set({ pattern }),

  save: async () => {
    const { name, pattern, steps, context, editingId } = get();
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
      const result = editingId
        ? await portClient.request('walkthrough.update', { ...payload, id: editingId })
        : await portClient.request('walkthrough.save', payload);
      set({ saveStatus: 'saved', savedOffline: !result.synced });
    } catch (err) {
      set({ saveStatus: 'idle', error: err as ApiError });
    }
  },

  reset: () =>
    set({
      recording: false,
      steps: [],
      name: '',
      pattern: '',
      editingId: null,
      saveStatus: 'idle',
      savedOffline: false,
      error: null,
    }),

  clearError: () => set({ error: null }),
}));

// Captured steps arrive as worker events; fold them into the store.
portClient.onEvent((event) => {
  if (event.type === 'author.captured') {
    useAuthorStore.getState().addStep(event.step);
  }
});
