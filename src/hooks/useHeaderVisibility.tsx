import { useState, useEffect } from 'react';
import { subscribeToHeaderVisibility, getHeaderVisibilityState } from '../services/FeedStore';
import { isSmallScreen, isTablet } from '../utils/helpers/screenSize';

export interface HeaderVisibilityState {
  isSnappedToTop: boolean;
  scrollY: number;
  headerHeight: number;
}

export function useHeaderVisibility(): HeaderVisibilityState {
  const [state, setState] = useState<HeaderVisibilityState>(getHeaderVisibilityState());

  useEffect(() => {
    const unsubscribe = subscribeToHeaderVisibility((newState) => {
      setState(newState);
    });

    return unsubscribe;
  }, []);

  // Disable header hiding on small screens and tablets
  const isSmallDevice = isSmallScreen() || isTablet();
  
  if (isSmallDevice) {
    return {
      ...state,
      isSnappedToTop: true, // Always keep header visible on small devices
    };
  }

  return state;
} 