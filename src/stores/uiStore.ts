/**
 * UI State Store
 * Manages common UI state patterns to reduce component-level useState calls
 * Use this for frequently-accessed or shared UI state
 */
import { create } from 'zustand';

interface LoadingState {
  [key: string]: boolean;
}

interface VisibilityState {
  [key: string]: boolean;
}

interface ProgressState {
  [key: string]: number;
}

interface UIState {
  // Loading states
  loading: LoadingState;
  setLoading: (key: string, isLoading: boolean) => void;
  getLoading: (key: string) => boolean;
  clearAllLoading: () => void;

  // Visibility states (for modals, dropdowns, etc.)
  visibility: VisibilityState;
  setVisibility: (key: string, isVisible: boolean) => void;
  getVisibility: (key: string) => boolean;
  toggleVisibility: (key: string) => void;
  clearAllVisibility: () => void;

  // Progress states (for uploads, downloads, etc.)
  progress: ProgressState;
  setProgress: (key: string, progress: number) => void;
  getProgress: (key: string) => number;
  clearProgress: (key: string) => void;
  clearAllProgress: () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  // Loading states
  loading: {},

  setLoading: (key: string, isLoading: boolean) => {
    set(state => ({
      loading: { ...state.loading, [key]: isLoading },
    }));
  },

  getLoading: (key: string) => {
    return get().loading[key] ?? false;
  },

  clearAllLoading: () => {
    set({ loading: {} });
  },

  // Visibility states
  visibility: {},

  setVisibility: (key: string, isVisible: boolean) => {
    set(state => ({
      visibility: { ...state.visibility, [key]: isVisible },
    }));
  },

  getVisibility: (key: string) => {
    return get().visibility[key] ?? false;
  },

  toggleVisibility: (key: string) => {
    set(state => ({
      visibility: { ...state.visibility, [key]: !state.visibility[key] },
    }));
  },

  clearAllVisibility: () => {
    set({ visibility: {} });
  },

  // Progress states
  progress: {},

  setProgress: (key: string, progress: number) => {
    set(state => {
      const clampedProgress = Math.max(0, Math.min(100, progress));
      const currentProgress = state.progress[key] ?? 0;
      // Only update if new progress is greater than or equal to current
      // This prevents progress from jumping backwards, which confuses users
      const newProgress = Math.max(currentProgress, clampedProgress);
      return {
        progress: { ...state.progress, [key]: newProgress },
      };
    });
  },

  getProgress: (key: string) => {
    return get().progress[key] ?? 0;
  },

  clearProgress: (key: string) => {
    set(state => {
      const { [key]: _, ...rest } = state.progress;
      return { progress: rest };
    });
  },

  clearAllProgress: () => {
    set({ progress: {} });
  },
}));

// Convenience hooks for common patterns
export const useLoading = (key: string) => {
  const isLoading = useUIStore(state => state.loading[key] ?? false);
  const setLoading = useUIStore(state => state.setLoading);

  return [isLoading, (loading: boolean) => setLoading(key, loading)] as const;
};

export const useVisibility = (key: string) => {
  const isVisible = useUIStore(state => state.visibility[key] ?? false);
  const setVisibility = useUIStore(state => state.setVisibility);
  const toggle = useUIStore(state => state.toggleVisibility);

  return {
    isVisible,
    setVisible: (visible: boolean) => setVisibility(key, visible),
    toggle: () => toggle(key),
  };
};
