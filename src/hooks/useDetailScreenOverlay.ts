import { useCallback, useMemo } from 'react';
import { useSegments } from 'expo-router';
import {
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolate,
  runOnUI,
} from 'react-native-reanimated';
import { useFeedSettings } from '../stores/userStore';
import { SCROLL_CONSTANTS } from '../utils/constants';

/**
 * Single hook for detail screen (profile/channel) overlay: modal layout + scroll-driven fade.
 * Returns layout values (isModal, headerPaddingTop, actionButtonsTop, showBackButton) and
 * scroll fade (handleVerticalScroll, overlayAnimatedStyle, backIconPrimaryStyle, backIconSecondaryStyle).
 */
export function useDetailScreenOverlay(
  identifier: string | null | undefined,
  defaultTop: number
): {
  isModal: boolean;
  headerPaddingTop: number | undefined;
  actionButtonsTop: number;
  showBackButton: boolean;
  handleVerticalScroll: (scrollY: number) => void;
  overlayAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  backIconPrimaryStyle: ReturnType<typeof useAnimatedStyle>;
  backIconSecondaryStyle: ReturnType<typeof useAnimatedStyle>;
} {
  const segments = useSegments();
  const { modalProfileEnabled } = useFeedSettings();
  const headerScrollProgress = useSharedValue(0);

  const { isModal, headerPaddingTop, actionButtonsTop, showBackButton } = useMemo(() => {
    const isModal = modalProfileEnabled && !!identifier && !segments.includes('(tabs)');
    const showBackButton = !!identifier && !isModal;
    return {
      isModal,
      headerPaddingTop: isModal ? 24 : modalProfileEnabled ? defaultTop + 4 : undefined,
      actionButtonsTop: isModal ? 20 : defaultTop,
      showBackButton,
    };
  }, [modalProfileEnabled, identifier, segments, defaultTop]);

  const handleVerticalScroll = useCallback(
    (scrollY: number) => {
      runOnUI((y: number, fadeDist: number) => {
        'worklet';
        headerScrollProgress.value = Math.max(0, Math.min(1, y / fadeDist));
      })(scrollY, SCROLL_CONSTANTS.HEADER_FADE_DISTANCE);
    },
    [headerScrollProgress]
  );

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(headerScrollProgress.value, [0, 0.3, 0.8], [1, 1, 0], Extrapolate.CLAMP),
  }));

  const backIconPrimaryStyle = useAnimatedStyle(() => ({
    opacity: interpolate(headerScrollProgress.value, [0, 1], [1, 0], Extrapolate.CLAMP),
  }));

  const backIconSecondaryStyle = useAnimatedStyle(() => ({
    opacity: interpolate(headerScrollProgress.value, [0, 1], [0, 1], Extrapolate.CLAMP),
  }));

  return {
    isModal,
    headerPaddingTop,
    actionButtonsTop,
    showBackButton,
    handleVerticalScroll,
    overlayAnimatedStyle,
    backIconPrimaryStyle,
    backIconSecondaryStyle,
  };
}
