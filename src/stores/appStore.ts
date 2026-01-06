/**
 * App State Management
 * Manages core app states like initialization and loading
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { storageAdapter } from '../utils/storage/storage';

interface AppState {
  // App initialization state
  fontsLoaded: boolean;
  appState: string;

  // Actions
  setFontsLoaded: (loaded: boolean) => void;
  setAppState: (state: string) => void;

  // Combined actions
  initializeApp: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, _get) => ({
      // Initial state
      fontsLoaded: false,
      appState: 'active',

      // Actions
      setFontsLoaded: (loaded: boolean) => set({ fontsLoaded: loaded }),
      setAppState: (appState: string) => set({ appState }),

      // Combined actions
      initializeApp: () => set({ fontsLoaded: false }),
    }),
    {
      name: 'app-store',
      storage: createJSONStorage(() => storageAdapter),
      partialize: state => ({
        // Only persist app state, not loading states
        appState: state.appState,
      }),
    }
  )
);

// Convenience hooks - optimized with individual selectors
export const useAppInitialization = () => {
  const fontsLoaded = useAppStore(state => state.fontsLoaded);
  const appState = useAppStore(state => state.appState);
  const setFontsLoaded = useAppStore(state => state.setFontsLoaded);
  const setAppState = useAppStore(state => state.setAppState);
  const initializeApp = useAppStore(state => state.initializeApp);

  return {
    fontsLoaded,
    appState,
    setFontsLoaded,
    setAppState,
    initializeApp,
  };
};
