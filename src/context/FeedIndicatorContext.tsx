import React, { createContext, useContext, useState, useCallback } from 'react';
import { useSharedValue, SharedValue } from 'react-native-reanimated';

type TabBarContextValue = {
  tabBarHeight: number | null;
  setTabBarHeight: (height: number) => void;
  /**
   * Visibility shared value for bottom tab bar & related controls (0 = hidden, 1 = visible).
   * Controlled by scroll on the home feed.
   * This is a Reanimated shared value for direct use in animated styles.
   */
  tabBarVisibility: SharedValue<number>;
  setTabBarVisibility: (visibility: number) => void;
  /**
   * Overlay visibility shared value for video overlays (0 = hidden, 1 = visible).
   * Controlled only by scroll-based viewability tracking (onViewableItemsChanged).
   */
  overlayVisibility: SharedValue<number>;
  setOverlayVisibility: (visibility: number) => void;
};

const TabBarContext = createContext<TabBarContextValue | null>(null);

export const TabBarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tabBarHeight, setTabBarHeight] = useState<number | null>(null);
  const tabBarVisibility = useSharedValue(1);
  const overlayVisibility = useSharedValue(1);

  const handleSetTabBarHeight = useCallback((height: number) => {
    setTabBarHeight(height);
  }, []);

  const handleSetTabBarVisibility = useCallback(
    (visibility: number) => {
      const clamped = Math.max(0, Math.min(1, visibility));
      // Reanimated shared values are intentionally mutated for UI-thread sync
      // eslint-disable-next-line react-hooks/immutability
      tabBarVisibility.value = clamped;
    },
    [tabBarVisibility]
  );

  const handleSetOverlayVisibility = useCallback(
    (visibility: number) => {
      const clamped = Math.max(0, Math.min(1, visibility));
      // eslint-disable-next-line react-hooks/immutability
      overlayVisibility.value = clamped;
    },
    [overlayVisibility]
  );

  return (
    <TabBarContext.Provider
      value={{
        tabBarHeight,
        setTabBarHeight: handleSetTabBarHeight,
        tabBarVisibility,
        setTabBarVisibility: handleSetTabBarVisibility,
        overlayVisibility,
        setOverlayVisibility: handleSetOverlayVisibility,
      }}
    >
      {children}
    </TabBarContext.Provider>
  );
};

export const useTabBarHeight = () => {
  const context = useContext(TabBarContext);
  return context?.tabBarHeight ?? null;
};

export const useSetTabBarHeight = () => {
  const context = useContext(TabBarContext);
  return context?.setTabBarHeight ?? (() => {});
};

export const useTabBarVisibility = () => {
  const context = useContext(TabBarContext);
  if (!context) {
    throw new Error('useTabBarVisibility must be used within TabBarProvider');
  }
  return context.tabBarVisibility;
};

export const useSetTabBarVisibility = () => {
  const context = useContext(TabBarContext);
  if (!context) {
    throw new Error('useSetTabBarVisibility must be used within TabBarProvider');
  }
  return context.setTabBarVisibility;
};

export const useOverlayVisibility = () => {
  const context = useContext(TabBarContext);
  if (!context) {
    throw new Error('useOverlayVisibility must be used within TabBarProvider');
  }
  return context.overlayVisibility;
};

export const useSetOverlayVisibility = () => {
  const context = useContext(TabBarContext);
  if (!context) {
    throw new Error('useSetOverlayVisibility must be used within TabBarProvider');
  }
  return context.setOverlayVisibility;
};
