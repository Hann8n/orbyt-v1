import React, { useState, useCallback, useRef } from 'react';
import { useAnimatedReaction, runOnJS, useSharedValue, withTiming, Easing, useAnimatedStyle, SharedValue } from 'react-native-reanimated';
import { useCurrentTabScrollY } from 'react-native-collapsible-tab-view';

interface UseHeaderVisibilityOptions {
  headerHeight?: number;
  fadeThreshold?: number;
  feedId?: string; // Unique identifier for each feed
  fadeDurationMs?: number;
  // Extra pixels to prevent rapid toggling around threshold
  hysteresisPx?: number;
}

interface UseHeaderVisibilityReturn {
  headerVisible: boolean;
  // Numeric opacity (JS) for consumers that can't use animated styles
  headerOpacity: number;
  // Animated style for smooth UI-thread fades
  headerAnimatedStyle: any;
  // UI-thread shared values for advanced consumers
  headerOpacitySV: SharedValue<number>;
  headerVisibleSV: SharedValue<boolean>;
  updateHeaderVisibility: (visible: boolean) => void;
  HeaderVisibilityTracker: React.FC;
}

export const useHeaderVisibility = ({
  headerHeight = 280,
  fadeThreshold = 0.6,
  feedId = 'default',
  fadeDurationMs = 320,
  hysteresisPx = 24,
}: UseHeaderVisibilityOptions = {}): UseHeaderVisibilityReturn => {
  const [headerVisible, setHeaderVisible] = useState<boolean>(true);
  const [headerOpacity, setHeaderOpacity] = useState<number>(1);
  const lastVisibleRef = useRef<boolean>(true);

  // Reanimated shared opacity value for smooth fade
  const animatedOpacity = useSharedValue(1);
  // Track last visibility on UI thread to avoid runOnJS spam
  const lastVisibleSV = useSharedValue<boolean>(true);

  const animateToVisibility = useCallback(
    (visible: boolean) => {
      // Keep boolean state in sync
      setHeaderVisible(visible);

      // Smoothly animate opacity on UI thread
      const isHiding = !visible;
      const targetOpacity = visible ? 1 : 0;
      const duration = isHiding ? Math.round(fadeDurationMs * 1.5) : fadeDurationMs;
      const easing = isHiding ? Easing.out(Easing.cubic) : Easing.out(Easing.quad);
      animatedOpacity.value = withTiming(targetOpacity, {
        duration,
        easing,
      });

      // Keep JS numeric opacity roughly in sync at endpoints
      setHeaderOpacity(visible ? 1 : 0);
    },
    [animatedOpacity, fadeDurationMs]
  );

  const updateHeaderVisibility = useCallback(
    (visible: boolean) => {
      // Only react to actual changes
      if (lastVisibleRef.current === visible) return;
      lastVisibleRef.current = visible;
      animateToVisibility(visible);
    },
    [animateToVisibility]
  );

  // Header visibility tracker component
  const HeaderVisibilityTracker: React.FC = () => {
    const scrollY = useCurrentTabScrollY();

    useAnimatedReaction(
      () => {
        const currentScrollY = scrollY.value;
        const threshold = headerHeight * fadeThreshold;

        // Apply hysteresis to prevent flicker and excessive JS updates
        const previouslyVisible = lastVisibleSV.value;
        const showLimit = threshold - hysteresisPx;
        const hideLimit = threshold + hysteresisPx;

        // If we were visible, require scrolling past hideLimit to hide.
        // If we were hidden, require scrolling above showLimit to show.
        let nextVisible = previouslyVisible;
        if (previouslyVisible) {
          if (currentScrollY > hideLimit) nextVisible = false;
        } else {
          if (currentScrollY < showLimit) nextVisible = true;
        }

        return nextVisible;
      },
      (nextVisible) => {
        if (typeof nextVisible !== 'boolean') return;
        if (nextVisible !== lastVisibleSV.value) {
          lastVisibleSV.value = nextVisible;
          // Update boolean state on JS thread and animate opacity at threshold crossings only
          runOnJS(updateHeaderVisibility)(nextVisible);
        }
      }
    );

    return null; // This component doesn't render anything
  };

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: animatedOpacity.value,
  }));

  return {
    headerVisible,
    headerOpacity,
    headerAnimatedStyle,
    headerOpacitySV: animatedOpacity,
    headerVisibleSV: lastVisibleSV,
    updateHeaderVisibility,
    HeaderVisibilityTracker,
  };
};
