import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import { TAB_BAR_CONTENT_HEIGHT } from '@/components/layout/navigation/AppTabBar';

export function useViewportHeight({
  hasTabBar,
  feedLayoutHeight,
}: {
  hasTabBar: boolean;
  feedLayoutHeight: number;
}): number {
  const insets = useSafeAreaInsets();
  const { screenHeight } = useDeviceLayout();

  return useMemo(() => {
    // Prefer the measured layout height — exact, no estimation needed.
    if (feedLayoutHeight > 0) return feedLayoutHeight;
    // Before layout fires, derive the accurate height from known constants so that
    // card sizes and scroll offsets are correct on the very first render.
    const belowTabBar = Math.max(
      0,
      screenHeight - insets.bottom - (hasTabBar ? TAB_BAR_CONTENT_HEIGHT : 0)
    );
    return belowTabBar;
  }, [hasTabBar, screenHeight, insets.bottom, feedLayoutHeight]);
}
