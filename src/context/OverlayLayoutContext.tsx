import React, { createContext, useContext, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isIosLiquidGlassAvailable } from '../stores/userStore';
import { getBottomNavBarHeight } from '@/utils/device/screen';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';

export interface OverlayLayoutValue {
  isTablet: boolean;
  bottomNavBarHeight: number;
}

const OverlayLayoutContext = createContext<OverlayLayoutValue | null>(null);

/**
 * Provides isTablet and bottomNavBarHeight for overlay positioning.
 * Lifts per-item subscriptions to one. Place at root (e.g. app _layout) inside TabBarProvider.
 */
export const OverlayLayoutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const insets = useSafeAreaInsets();
  const deviceLayout = useDeviceLayout();

  const { isTablet, isCompact } = deviceLayout;

  const value = useMemo((): OverlayLayoutValue => {
    const base = getBottomNavBarHeight(insets, isCompact);
    const bottomNavBarHeight = isIosLiquidGlassAvailable ? base + 10 : base;

    return {
      isTablet,
      bottomNavBarHeight,
    };
  }, [insets, isCompact, isTablet]);

  return <OverlayLayoutContext.Provider value={value}>{children}</OverlayLayoutContext.Provider>;
};

export function useOverlayLayout(): OverlayLayoutValue | null {
  return useContext(OverlayLayoutContext);
}
