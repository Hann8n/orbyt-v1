import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { usePathname, useSegments } from 'expo-router';

import { useVisibilityCoreStore } from './visibilityStore';

interface VisibilityProviderProps {
  children: React.ReactNode;
}

export const VisibilityProvider: React.FC<VisibilityProviderProps> = ({ children }) => {
  const setAppState = useVisibilityCoreStore((state) => state.setAppState);
  const setIsForeground = useVisibilityCoreStore((state) => state.setIsForeground);
  const setActiveRoutePath = useVisibilityCoreStore((state) => state.setActiveRoutePath);
  const setActiveTabSegment = useVisibilityCoreStore((state) => state.setActiveTabSegment);

  const pathname = usePathname();
  const segments = useSegments();

  useEffect(() => {
    const initialState = AppState.currentState;
    setAppState(initialState);
    setIsForeground(initialState === 'active');

    const subscription = AppState.addEventListener('change', (nextState) => {
      setAppState(nextState);
      setIsForeground(nextState === 'active');
    });

    return () => subscription.remove();
  }, [setAppState, setIsForeground]);

  useEffect(() => {
    setActiveRoutePath(pathname ?? null);
  }, [pathname, setActiveRoutePath]);

  useEffect(() => {
    const normalizedSegments = Array.from(segments);
    let tabSegment: string | null = null;
    if (normalizedSegments.length >= 2 && normalizedSegments[0] === '(tabs)') {
      tabSegment = normalizedSegments[1];
    }
    setActiveTabSegment(tabSegment);
  }, [segments, setActiveTabSegment]);

  return <>{children}</>;
};
