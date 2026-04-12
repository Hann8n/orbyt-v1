import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
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
};

const TabBarContext = createContext<TabBarContextValue | null>(null);

export const TabBarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tabBarHeight, setTabBarHeight] = useState<number | null>(null);
  const tabBarVisibility = useSharedValue(1);

  const handleSetTabBarHeight = useCallback((height: number) => {
    setTabBarHeight(height);
  }, []);

  const contextValue = useMemo(
    () => ({
      tabBarHeight,
      setTabBarHeight: handleSetTabBarHeight,
      tabBarVisibility,
    }),
    [tabBarHeight, handleSetTabBarHeight, tabBarVisibility]
  );

  return <TabBarContext.Provider value={contextValue}>{children}</TabBarContext.Provider>;
};

export const useTabBarHeight = () => {
  const context = useContext(TabBarContext);
  return context?.tabBarHeight ?? null;
};

export const useTabBarVisibility = () => {
  const context = useContext(TabBarContext);
  if (!context) {
    throw new Error('useTabBarVisibility must be used within TabBarProvider');
  }
  return context.tabBarVisibility;
};
