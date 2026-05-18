import React, { createContext, use, useMemo } from 'react';
import { useSharedValue, SharedValue } from 'react-native-reanimated';

type TabBarContextValue = {
  /**
   * Visibility shared value for bottom tab bar & related controls (0 = hidden, 1 = visible).
   * Controlled by scroll on the home feed.
   * This is a Reanimated shared value for direct use in animated styles.
   */
  tabBarVisibility: SharedValue<number>;
};

const TabBarContext = createContext<TabBarContextValue | null>(null);

export const TabBarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const tabBarVisibility = useSharedValue(1);

  const contextValue = useMemo(
    () => ({
      tabBarVisibility,
    }),
    [tabBarVisibility]
  );

  return <TabBarContext value={contextValue}>{children}</TabBarContext>;
};

export const useTabBarVisibility = () => {
  const context = use(TabBarContext);
  if (!context) {
    throw new Error('useTabBarVisibility must be used within TabBarProvider');
  }
  return context.tabBarVisibility;
};
