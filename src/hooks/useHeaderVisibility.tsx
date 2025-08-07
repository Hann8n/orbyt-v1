import { useMemo, useState, useEffect, useRef } from 'react';
import { isSmallScreen, isTablet } from '../utils/helpers/screenSize';

export interface HeaderVisibilityState {
  isSnappedToTop: boolean;
  scrollY: number;
  headerHeight: number;
  isShadowVisible: boolean;
}

// Feed-specific header visibility state - each feed has its own state
const feedHeaderStates: Map<string, HeaderVisibilityState> = new Map();

// Global listeners for header state changes - keyed by feed
const listeners: Map<string, Set<(state: HeaderVisibilityState) => void>> = new Map();

// Get or create header state for a specific feed
const getFeedHeaderState = (feedKey: string): HeaderVisibilityState => {
  if (!feedHeaderStates.has(feedKey)) {
    feedHeaderStates.set(feedKey, {
      isSnappedToTop: true,
      scrollY: 0,
      headerHeight: 0,
      isShadowVisible: true,
    });
  }
  return feedHeaderStates.get(feedKey)!;
};

// Update header state for a specific feed and notify listeners
const updateFeedHeaderState = (feedKey: string, newState: Partial<HeaderVisibilityState>) => {
  const currentState = getFeedHeaderState(feedKey);
  const updatedState = { ...currentState, ...newState };
  feedHeaderStates.set(feedKey, updatedState);
  
  // Notify listeners for this specific feed
  const feedListeners = listeners.get(feedKey);
  if (feedListeners) {
    feedListeners.forEach(listener => listener(updatedState));
  }
};

// Dynamic header visibility hook - only active on medium/large screens
export function useHeaderVisibility(feedKey?: string): HeaderVisibilityState {
  const [state, setState] = useState<HeaderVisibilityState>(() => 
    feedKey ? getFeedHeaderState(feedKey) : {
      isSnappedToTop: true,
      scrollY: 0,
      headerHeight: 0,
      isShadowVisible: true,
    }
  );
  const isSmallDevice = isSmallScreen() || isTablet();
  
  useEffect(() => {
    // Only track header visibility on medium/large screens
    if (isSmallDevice || !feedKey) {
      return;
    }
    
    const listener = (newState: HeaderVisibilityState) => {
      setState(newState);
    };
    
    // Add listener for this specific feed
    if (!listeners.has(feedKey)) {
      listeners.set(feedKey, new Set());
    }
    listeners.get(feedKey)!.add(listener);
    
    return () => {
      const feedListeners = listeners.get(feedKey);
      if (feedListeners) {
        feedListeners.delete(listener);
        if (feedListeners.size === 0) {
          listeners.delete(feedKey);
        }
      }
    };
  }, [isSmallDevice, feedKey]);
  
  // Return static values for small devices/tablets or when no feedKey provided
  if (isSmallDevice || !feedKey) {
    return useMemo(() => ({
      isSnappedToTop: true,
      scrollY: 0,
      headerHeight: 0,
      isShadowVisible: true,
    }), []);
  }
  
  return state;
}

// Export function to update header state for a specific feed
export const updateHeaderVisibility = (feedKey: string, newState: Partial<HeaderVisibilityState>) => {
  updateFeedHeaderState(feedKey, newState);
};

// Helper function to generate feed key from feed option and user DID
export const generateFeedKey = (feedOption: string, userDid?: string): string => {
  return `${feedOption}-${userDid || 'default'}`;
};