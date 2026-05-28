import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import { getViewportDimensions } from '../utils/device/screen';

export function useViewportHeight({
  hasTabBar,
  useManualIosGlassTabPaddingLayout,
  feedLayoutHeight,
}: {
  hasTabBar: boolean;
  useManualIosGlassTabPaddingLayout: boolean;
  feedLayoutHeight: number;
}): number {
  const insets = useSafeAreaInsets();
  const { screenHeight } = useDeviceLayout();

  return useMemo(() => {
    if (!hasTabBar) {
      const maxViewport = Math.max(0, screenHeight - insets.bottom);
      return feedLayoutHeight > 0 ? Math.min(feedLayoutHeight, maxViewport) : maxViewport;
    }
    if (useManualIosGlassTabPaddingLayout) {
      return getViewportDimensions(
        { top: insets.top, bottom: insets.bottom, left: 0, right: 0 },
        { useFullWindowHeight: !hasTabBar }
      ).height;
    }
    return Math.max(0, screenHeight - insets.bottom);
  }, [
    hasTabBar,
    screenHeight,
    insets.top,
    insets.bottom,
    feedLayoutHeight,
    useManualIosGlassTabPaddingLayout,
  ]);
}
