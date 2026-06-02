import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useAnimatedReaction } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { getStatusBarStyle } from '@/utils/formatting/colors';

const SCROLL_TRIGGER_THRESHOLD = 0.4;

/**
 * Imperatively drives the status bar style based on profile background color and scroll position.
 * At the top: uses the profile-derived style. Once scrolled past the threshold: resets to 'light'.
 * No React state — zero re-renders from status bar transitions.
 */
export function useProfileStatusBar(
  backgroundColor: string,
  enabled = true,
  scrollProgressSV?: SharedValue<number>
) {
  const applyStyle = useCallback(
    (scrolled: boolean) => {
      if (!enabled) return;
      setStatusBarStyle(scrolled ? 'light' : getStatusBarStyle(backgroundColor), true);
    },
    [enabled, backgroundColor]
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
