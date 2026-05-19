import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useAnimatedReaction } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { getStatusBarStyle } from '@/utils/formatting/colors';

/**
 * Sets status bar style based on profile text color when screen is focused.
 * Once the feed scrolls, always switches to light (no toggle-back complexity).
 * Uses Reanimated 4 + expo-status-bar imperative API for zero JS-thread churn.
 *
 * @param textColor - The profile's text/foreground color
 * @param enabled - Whether to control the status bar (default: true)
 * @param scrollProgressSV - Optional shared scroll progress (0..1). When > 0, forces light.
 */
export function useProfileStatusBar(
  textColor: string,
  enabled = true,
  scrollProgressSV?: SharedValue<number>
) {
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;

      const style = getStatusBarStyle(textColor);
      setStatusBarStyle(style === 'light' ? 'light' : 'dark', true);

      if (scrollProgressSV && scrollProgressSV.value > 0) {
        setStatusBarStyle('light', true);
      }

      return () => {
        setStatusBarStyle('light', true);
      };
    }, [enabled, textColor, scrollProgressSV])
  );

  useAnimatedReaction(
    () => (scrollProgressSV?.value ?? 0) > 0,
    (hasScrolled, prevHasScrolled) => {
      if (prevHasScrolled === null || !hasScrolled) return;
      scheduleOnRN(setStatusBarStyle, 'light', true);
    },
    [scrollProgressSV]
  );
}
