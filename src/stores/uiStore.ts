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
