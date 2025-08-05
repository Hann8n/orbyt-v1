import { useState } from 'react';

export interface HeaderVisibilityState {
  isSnappedToTop: boolean;
  scrollY: number;
  headerHeight: number;
  isShadowVisible: boolean;
}

export function useHeaderVisibility(): HeaderVisibilityState {
  const [state] = useState<HeaderVisibilityState>({
    isSnappedToTop: true,
    scrollY: 0,
    headerHeight: 0,
    isShadowVisible: true,
  });

  return state;
}