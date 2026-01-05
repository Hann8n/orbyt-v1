import React, { createContext, useContext, useState, useCallback } from 'react';

type TabBarContextValue = {
  tabBarHeight: number | null;
  setTabBarHeight: (height: number) => void;
};

const TabBarContext = createContext<TabBarContextValue | null>(null);

export const TabBarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tabBarHeight, setTabBarHeight] = useState<number | null>(null);

  const handleSetTabBarHeight = useCallback((height: number) => {
    setTabBarHeight(height);
  }, []);

  return (
    <TabBarContext.Provider value={{ tabBarHeight, setTabBarHeight: handleSetTabBarHeight }}>
      {children}
    </TabBarContext.Provider>
  );
};

export const useTabBarHeight = () => {
  const context = useContext(TabBarContext);
  if (!context) {
    // Return null if context is not available (graceful degradation)
    return null;
  }
  return context.tabBarHeight;
};

export const useSetTabBarHeight = () => {
  const context = useContext(TabBarContext);
  if (!context) {
    return () => {}; // No-op if context is not available
  }
  return context.setTabBarHeight;
};
