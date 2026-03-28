import { useCallback, useMemo } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import {
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolate,
  runOnUI,
} from 'react-native-reanimated';
import { SCROLL_CONSTANTS } from '../utils/constants';

/**
 * Detail screen (profile/channel) overlay: scroll-driven fade for back affordance.
 * Returns layout values (headerPaddingTop, actionButtonsTop, showBackButton) and
 * scroll fade (handleVerticalScroll, overlayAnimatedStyle, backIconPrimaryStyle, backIconSecondaryStyle).
 * When contentScrollProgressSV is provided (from feed context), overlay uses it so animations stay on the UI thread.
 * handleVerticalScroll is for screens that have scroll but do not provide contentScrollProgressSV (e.g. custom scroll views);
 * profile/channel pass contentScrollProgressSV from the list, so they do not use handleVerticalScroll.
 */
export function useDetailScreenOverlay(
  identifier: string | null | undefined,
  defaultTop: number,
  contentScrollProgressSV?: SharedValue<number>
): {
  headerPaddingTop: number | undefined;
  actionButtonsTop: number;
  showBackButton: boolean;
  /** Only used when contentScrollProgressSV is not provided (screens without list scroll context). */
  handleVerticalScroll: (scrollY: number) => void;
  overlayAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  backIconPrimaryStyle: ReturnType<typeof useAnimatedStyle>;
  backIconSecondaryStyle: ReturnType<typeof useAnimatedStyle>;
} {
  const ownScrollProgress = useSharedValue(0);
  const progressSV = contentScrollProgressSV ?? ownScrollProgress;

  const { headerPaddingTop, actionButtonsTop, showBackButton } = useMemo(() => {
    return {
      headerPaddingTop: undefined,
      actionButtonsTop: defaultTop,
      showBackButton: !!identifier,
    };
  }, [identifier, defaultTop]);

  const handleVerticalScroll = useCallback(
    (scrollY: number) => {
      if (contentScrollProgressSV != null) return;
      runOnUI((y: number, fadeDist: number) => {
        'worklet';
        ownScrollProgress.value = Math.max(0, Math.min(1, y / fadeDist));
      })(scrollY, SCROLL_CONSTANTS.HEADER_FADE_DISTANCE);
    },
    [contentScrollProgressSV, ownScrollProgress]
  );

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progressSV.value, [0, 0.5, 0.95], [1, 1, 0], Extrapolate.CLAMP),
  }));

  const backIconPrimaryStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progressSV.value, [0, 1], [1, 0], Extrapolate.CLAMP),
  }));

  const backIconSecondaryStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progressSV.value, [0, 1], [0, 1], Extrapolate.CLAMP),
  }));

  return {
    headerPaddingTop,
    actionButtonsTop,
    showBackButton,
    handleVerticalScroll,
    overlayAnimatedStyle,
    backIconPrimaryStyle,
    backIconSecondaryStyle,
  };
}
