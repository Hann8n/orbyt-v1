/**
 * UI State Management
 * Manages simple UI states like clear view mode
 */
import { create } from 'zustand';

interface UIState {
  // Clear view mode for minimal UI
  isClearViewMode: boolean;
  
  // Actions
  setClearViewMode: (enabled: boolean) => void;
  toggleClearViewMode: () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  // State
  isClearViewMode: false,
  
  // Actions
  setClearViewMode: (enabled: boolean) => set({ isClearViewMode: enabled }),
  
  toggleClearViewMode: () => set(state => ({ 
    isClearViewMode: !state.isClearViewMode 
  })),
}));

// Convenience hooks
export const useClearView = () => {
  const isClearViewMode = useUIStore(state => state.isClearViewMode);
  const setClearViewMode = useUIStore(state => state.setClearViewMode);
  const toggleClearViewMode = useUIStore(state => state.toggleClearViewMode);
  
  return {
    isClearViewMode,
    setClearViewMode,
    toggleClearViewMode,
  };
};
