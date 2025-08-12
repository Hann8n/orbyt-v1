/**
 * App State Management
 * Manages core app states like authentication and loading
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AppState {
  // Authentication state
  isLoggedIn: boolean;
  isLoading: boolean;
  
  // App initialization state
  fontsLoaded: boolean;
  appState: string;
  
  // Actions
  setLoggedIn: (loggedIn: boolean) => void;
  setLoading: (loading: boolean) => void;
  setFontsLoaded: (loaded: boolean) => void;
  setAppState: (state: string) => void;
  
  // Combined actions
  initializeApp: () => void;
  completeLogin: () => void;
  completeLogout: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      isLoggedIn: false,
      isLoading: true,
      fontsLoaded: false,
      appState: 'active',
      
      // Actions
      setLoggedIn: (loggedIn: boolean) => set({ isLoggedIn: loggedIn }),
      setLoading: (loading: boolean) => set({ isLoading: loading }),
      setFontsLoaded: (loaded: boolean) => set({ fontsLoaded: loaded }),
      setAppState: (appState: string) => set({ appState }),
      
      // Combined actions
      initializeApp: () => set({ isLoading: true }),
      
      completeLogin: () => set({ 
        isLoggedIn: true, 
        isLoading: false 
      }),
      
      completeLogout: () => set({ 
        isLoggedIn: false, 
        isLoading: false 
      }),
    }),
    {
      name: 'app-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        // Only persist login state, not loading states
        isLoggedIn: state.isLoggedIn,
      }),
    }
  )
);

// Convenience hooks
export const useAuthState = () => {
  const isLoggedIn = useAppStore(state => state.isLoggedIn);
  const isLoading = useAppStore(state => state.isLoading);
  return { isLoggedIn, isLoading };
};

export const useAppLoading = () => {
  const isLoading = useAppStore(state => state.isLoading);
  const fontsLoaded = useAppStore(state => state.fontsLoaded);
  return { isLoading, fontsLoaded };
};
