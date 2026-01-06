import { AppStateStatus } from 'react-native';
import { create } from 'zustand';

/**
 * Minimal visibility store - tracks app state and active route
 * FlashList handles viewability natively, no need for complex feed tracking
 * With freezeOnBlur: true, route tracking via useIsFocused() correctly handles frozen tabs
 */
interface VisibilityState {
  appState: AppStateStatus;
  activeRoute: string | null;
  setAppState: (appState: AppStateStatus) => void;
  setActiveRoute: (route: string | null) => void;
}

export const useVisibilityCoreStore = create<VisibilityState>()(set => ({
  appState: 'active',
  activeRoute: null,
  setAppState: appState => set({ appState }),
  setActiveRoute: route => set({ activeRoute: route }),
}));
