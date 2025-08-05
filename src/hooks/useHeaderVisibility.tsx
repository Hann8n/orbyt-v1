import { useState, useEffect } from 'react';
import { subscribeToHeaderVisibility, getHeaderVisibilityState } from '../services/FeedStore';
import { isSmallScreen, isTablet } from '../utils/helpers/screenSize';

export interface HeaderVisibilityState {
  isSnappedToTop: boolean;
  scrollY: number;
  headerHeight: number;
  // Shadow should always be visible, not affected by scroll
  isShadowVisible: boolean;
}

export function useHeaderVisibility(): HeaderVisibilityState {
  const [state, setState] = useState<HeaderVisibilityState>({
    ...getHeaderVisibilityState(),
    isShadowVisible: true, // Shadow is always visible
  });

  useEffect(() => {
    const unsubscribe = subscribeToHeaderVisibility((newState) => {
      setState({
        ...newState,
        isShadowVisible: true, // Shadow is always visible regardless of scroll
      });
    });

    return unsubscribe;
  }, []);

  // Disable header hiding on small screens and tablets
  const isSmallDevice = isSmallScreen() || isTablet();
  
  if (isSmallDevice) {
    return {
      ...state,
      isSnappedToTop: true, // Always keep header visible on small devices
      isShadowVisible: true, // Shadow is always visible
    };
  }

  return state;
} 