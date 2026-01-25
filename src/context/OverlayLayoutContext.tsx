import React, { createContext, useContext, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTabBarHeight } from './FeedIndicatorContext';
import { useFeedSettings } from '../stores/userStore';
import { isTablet, isSmallScreen, getBottomNavBarHeight } from '../utils/device/screen';

export interface OverlayLayoutValue {
  isTablet: boolean;
  isSmallScreen: boolean;
  bottomNavBarHeight: number;
}

const OverlayLayoutContext = createContext<OverlayLayoutValue | null>(null);

/** Fallback when useOverlayLayout() is null (e.g. outside OverlayLayoutProvider). */
export const OVERLAY_LAYOUT_FALLBACK_BOTTOM_NAV = 80;

/**
 * Provides isTablet, isSmallScreen, and bottomNavBarHeight for overlay positioning.
 * Lifts per-item subscriptions to one. Place at root (e.g. app _layout) inside TabBarProvider.
 */
export const OverlayLayoutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const insets = useSafeAreaInsets();
  const measuredTabBarHeight = useTabBarHeight();
  const { nativeTabsEnabled } = useFeedSettings();

  const value = useMemo<OverlayLayoutValue>(() => {
    const calculated = getBottomNavBarHeight(insets);
    const base = measuredTabBarHeight ?? calculated;
    const bottomNavBarHeight = nativeTabsEnabled ? base + 10 : base;
    return {
      isTablet: isTablet(),
      isSmallScreen: isSmallScreen(),
      bottomNavBarHeight,
    };
  }, [insets, measuredTabBarHeight, nativeTabsEnabled]);

  return <OverlayLayoutContext.Provider value={value}>{children}</OverlayLayoutContext.Provider>;
};

export function useOverlayLayout(): OverlayLayoutValue | null {
  return useContext(OverlayLayoutContext);
}
