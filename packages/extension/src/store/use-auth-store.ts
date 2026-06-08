import { create } from 'zustand';
import { portClient } from '../lib/port-client';
import type { ApiError, Credentials, SessionUser } from '../shared/messages';

type Status = 'loading' | 'anonymous' | 'authenticated';

interface AuthState {
  status: Status;
  user: SessionUser | null;
  error: ApiError | null;
  submitting: boolean;
  /** Restore any persisted session from the worker on panel open. */
  init: () => Promise<void>;
  login: (credentials: Credentials) => Promise<void>;
  signup: (credentials: Credentials) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  user: null,
  error: null,
  submitting: false,

  init: async () => {
    try {
      const { user } = await portClient.request('auth.session');
      set({ user, status: user ? 'authenticated' : 'anonymous' });
    } catch {
      // Session lookup is local; treat any failure as signed-out.
      set({ status: 'anonymous' });
    }
  },

  login: async (credentials) => {
    set({ submitting: true, error: null });
    try {
      const { user } = await portClient.request('auth.login', credentials);
      set({ user, status: 'authenticated', submitting: false });
    } catch (err) {
      set({ error: err as ApiError, submitting: false });
    }
  },

  signup: async (credentials) => {
    set({ submitting: true, error: null });
    try {
      const { user } = await portClient.request('auth.signup', credentials);
      set({ user, status: 'authenticated', submitting: false });
    } catch (err) {
      set({ error: err as ApiError, submitting: false });
    }
  },

  logout: async () => {
    try {
      await portClient.request('auth.logout');
    } catch {
      // Logout clears local state regardless of worker outcome.
    }
    set({ user: null, status: 'anonymous', error: null });
  },

  clearError: () => set({ error: null }),
}));
