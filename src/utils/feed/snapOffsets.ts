type ListSnapOffsetsParams = {
  snapDisabledCompactLiquidGlass: boolean;
  snapWaitHeaderLayout: boolean;
  listSnapUsesInterval: boolean;
  hasHeader: boolean;
  headerHeight: number;
  cardHeight: number;
  itemCount: number;
  itemSpacing: number;
  snapTopInset: number;
  isHeaderFeed: boolean;
};

type GridSnapOffsetsParams = {
  useScrollTracking: boolean;
  headerHeight: number;
  isHeaderFeed: boolean;
  snapTopInset: number;
  itemCount: number;
  numColumns: number;
  itemSpacing: number;
};

export function buildListSnapToOffsets({
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
}: ListSnapOffsetsParams): number[] | undefined {
  if (snapDisabledCompactLiquidGlass || snapWaitHeaderLayout || listSnapUsesInterval) {
    return undefined;
  }

  if (hasHeader) {
    const useHeaderPitch = headerHeight > 0 && cardHeight > 0;
    const headerSnapAdjust = isHeaderFeed ? snapTopInset : 0;
    const offsets = new Array<number>(itemCount + 1);
    offsets[0] = 0;

    for (let i = 0; i < itemCount; i++) {
      if (useHeaderPitch) {
        const baseOffset = headerHeight + i * itemSpacing;
        offsets[i + 1] = baseOffset - headerSnapAdjust;
      } else {
        offsets[i + 1] = i * itemSpacing - snapTopInset;
      }
    }

    return offsets;
  }

  const offsets = new Array<number>(itemCount);
  for (let i = 0; i < itemCount; i++) {
    offsets[i] = i * itemSpacing - snapTopInset;
  }
  return offsets;
}

export function buildGridSnapToOffsets({
  useScrollTracking,
  headerHeight,
  isHeaderFeed,
  snapTopInset,
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

  return offsets;
}
