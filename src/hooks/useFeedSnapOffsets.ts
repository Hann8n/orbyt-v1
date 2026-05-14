import { useMemo } from 'react';
import { buildListSnapToOffsets } from '../utils/feed/snapOffsets';

export interface UseFeedSnapOffsetsParams {
  hasTabBar: boolean;
  isIosLiquidGlassAvailable: boolean;
  isCompact: boolean;
  hasHeader: boolean;
  headerHeight: number;
  cardHeight: number;
  itemCount: number;
  itemSpacing: number;
  snapTopInset: number;
  isHeaderFeed: boolean;
}

export function useFeedSnapOffsets({
  hasTabBar,
  isIosLiquidGlassAvailable,
  isCompact,
  hasHeader,
  headerHeight,
  cardHeight,
  itemCount,
  itemSpacing,
  snapTopInset,
  isHeaderFeed,
}: UseFeedSnapOffsetsParams) {
  const useManualIosGlassTabPaddingLayout = hasTabBar && isIosLiquidGlassAvailable;
  const snapDisabledCompactLiquidGlass =
    useManualIosGlassTabPaddingLayout && !hasHeader && isCompact;
  const snapWaitHeaderLayout = hasHeader && headerHeight <= 0;
  const listSnapUsesInterval =
    !snapDisabledCompactLiquidGlass &&
    !snapWaitHeaderLayout &&
    !hasHeader &&
    snapTopInset === 0 &&
    itemCount > 0;

  const snapToIntervalValue = listSnapUsesInterval ? itemSpacing : undefined;

  const snapToOffsets = useMemo(() => {
    return buildListSnapToOffsets({
      snapDisabledCompactLiquidGlass,
      snapWaitHeaderLayout,
      listSnapUsesInterval,
      hasHeader,
      headerHeight,
      cardHeight,
      itemCount,
      itemSpacing,
      snapTopInset,
      isHeaderFeed,
    });
  }, [
    snapDisabledCompactLiquidGlass,
    snapWaitHeaderLayout,
    listSnapUsesInterval,
    hasHeader,
    headerHeight,
    cardHeight,
    itemCount,
    itemSpacing,
    snapTopInset,
    isHeaderFeed,
  ]);

  return {
    snapToInterval: snapToIntervalValue,
    snapToOffsets,
    snapToAlignment: snapToIntervalValue != null ? ('start' as const) : undefined,
  };
}
