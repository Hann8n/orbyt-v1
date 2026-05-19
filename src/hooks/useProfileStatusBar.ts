import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useAnimatedReaction } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { getStatusBarStyle } from '@/utils/formatting/colors';

const SCROLL_TRIGGER_THRESHOLD = 0.4; // ~40% of scroll

export function useProfileStatusBar(
  textColor: string,
  enabled = true,
  scrollProgressSV?: SharedValue<number>
) {
  const applyStyle = useCallback(
    (scrolled: boolean) => {
      if (!enabled) return;
      setStatusBarStyle(scrolled ? 'light' : getStatusBarStyle(textColor), true);
    },
    [enabled, textColor]
  );

  useFocusEffect(
    useCallback(() => {
      applyStyle((scrollProgressSV?.value ?? 0) > SCROLL_TRIGGER_THRESHOLD);
      return () => setStatusBarStyle('light', true);
    }, [applyStyle, scrollProgressSV])
  );

  useAnimatedReaction(
    () => (scrollProgressSV?.value ?? 0) > SCROLL_TRIGGER_THRESHOLD,
    (hasScrolled, prevHasScrolled) => {
      if (prevHasScrolled === null || hasScrolled === prevHasScrolled) return;
      scheduleOnRN(applyStyle, hasScrolled);
    },
    [scrollProgressSV, applyStyle]
  );
}
