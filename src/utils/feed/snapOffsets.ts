type ListSnapOffsetsParams = {
  snapDisabledCompactLiquidGlass: boolean;
  snapWaitHeaderLayout: boolean;
  listSnapUsesInterval: boolean;
  isHeaderFeed: boolean;
  headerHeight: number;
  cardHeight: number;
  itemCount: number;
  itemSpacing: number;
  snapTopInset: number;
  snapBottomInset: number;
};

type GridSnapOffsetsParams = {
  useScrollTracking: boolean;
  headerHeight: number;
  isHeaderFeed: boolean;
  snapTopInset: number;
  snapBottomInset: number;
  itemCount: number;
  numColumns: number;
  itemSpacing: number;
};

export function buildListSnapToOffsets({
  snapDisabledCompactLiquidGlass,
  snapWaitHeaderLayout,
  listSnapUsesInterval,
  isHeaderFeed,
  headerHeight,
  cardHeight,
  itemCount,
  itemSpacing,
  snapTopInset,
  snapBottomInset,
}: ListSnapOffsetsParams): number[] | undefined {
  if (snapDisabledCompactLiquidGlass || snapWaitHeaderLayout || listSnapUsesInterval) {
    return undefined;
  }

  if (isHeaderFeed) {
    const useHeaderPitch = headerHeight > 0 && cardHeight > 0;
    const headerSnapAdjust = snapTopInset;
    const offsets = new Array<number>(itemCount + 1);
    offsets[0] = 0;

    for (let i = 0; i < itemCount; i++) {
      if (useHeaderPitch) {
        const baseOffset = headerHeight + i * itemSpacing;
        offsets[i + 1] = Math.round(baseOffset - headerSnapAdjust);
      } else {
        offsets[i + 1] = Math.round(i * itemSpacing - snapTopInset);
      }
    }

    // Adjust the last offset to respect bottom safe area
    if (offsets.length > 1 && snapBottomInset > 0) {
      const lastOffset = offsets[offsets.length - 1];
      offsets[offsets.length - 1] = Math.max(0, lastOffset - snapBottomInset);
    }

    return offsets;
  }

  return undefined;
}

export function buildGridSnapToOffsets({
  useScrollTracking,
  headerHeight,
  isHeaderFeed,
  snapTopInset,
  snapBottomInset,
  itemCount,
  numColumns,
  itemSpacing,
}: GridSnapOffsetsParams): number[] | undefined {
  if (!useScrollTracking) return undefined;
  if (headerHeight <= 0) return [0];

  const firstRowY = headerHeight - (isHeaderFeed ? snapTopInset : 0);
  const rowCount = itemCount === 0 ? 0 : Math.ceil(itemCount / numColumns);
  const offsets: number[] = [0];

  for (let row = 0; row < rowCount; row++) {
    offsets.push(firstRowY + row * itemSpacing);
  }

  // Adjust the last offset to respect bottom safe area
  if (offsets.length > 1 && snapBottomInset > 0) {
    const lastOffset = offsets[offsets.length - 1];
    offsets[offsets.length - 1] = Math.max(0, lastOffset - snapBottomInset);
  }

  return offsets;
}
