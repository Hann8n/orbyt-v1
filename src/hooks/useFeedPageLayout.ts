import { useMemo } from 'react';
import { useSafeAreaInsets, initialWindowMetrics } from 'react-native-safe-area-context';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import { isIosLiquidGlassAvailable } from '@/stores/userStore';
import { getEffectiveTopInset } from '../utils/device/screen';
import { IOS_LIQUID_GLASS_EXTRA_BOTTOM_PADDING } from '../components/features/feed/feedViewShared';

export interface FeedPageLayout {
  /** Full row height = measured FlashList frame height; fallback until measured. */
  pageHeight: number;
  /** Top safe-area inset; the video block may extend into it for vertical centering. */
  topInset: number;
  /** Bottom safe-area inset (includes iOS liquid-glass padding) the block reserves. */
  bottomInset: number;
}

/**
 * Single source of truth for the paged feed layout: every video row equals the scroll
 * viewport height so native `pagingEnabled` snaps each video to one full page. The video
 * block is sized from the bsky `aspectRatio` (see VideoCard) and centered between these
 * insets — free to extend into the top inset, never covering the bottom inset.
 */
export function useFeedPageLayout({
  hasTabBar,
  feedLayoutHeight,
}: {
  hasTabBar: boolean;
  feedLayoutHeight: number;
}): FeedPageLayout {
  const insets = useSafeAreaInsets();
  const { screenHeight, isCompact } = useDeviceLayout();

  const useManualIosGlassTabPaddingLayout = hasTabBar && isIosLiquidGlassAvailable;

  return useMemo(() => {
    // Floor insets with initialWindowMetrics so the band never flashes without safe area on
    // the first frame (the hook can briefly report 0 before the provider measures).
    const safeTop = getEffectiveTopInset(insets.top);
    const safeBottom = Math.max(insets.bottom, initialWindowMetrics?.insets.bottom ?? 0);

    const fallbackHeight = Math.max(0, screenHeight - safeBottom);
    const pageHeight = feedLayoutHeight > 0 ? feedLayoutHeight : fallbackHeight;

    const glassBottomPadding =
      useManualIosGlassTabPaddingLayout && !isCompact ? IOS_LIQUID_GLASS_EXTRA_BOTTOM_PADDING : 0;

    const topInset = safeTop;
    const bottomInset = safeBottom + glassBottomPadding;

    return { pageHeight, topInset, bottomInset };
  }, [
    feedLayoutHeight,
    screenHeight,
    insets.top,
    insets.bottom,
    isCompact,
    useManualIosGlassTabPaddingLayout,
  ]);
}
