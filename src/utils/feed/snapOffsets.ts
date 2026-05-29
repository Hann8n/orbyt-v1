type ListSnapOffsetsParams = {
  isHeaderFeed: boolean;
  headerHeight: number;
  cardHeight: number;
  itemCount: number;
  itemSpacing: number;
};

type GridSnapOffsetsParams = {
  useScrollTracking: boolean;
  headerHeight: number;
  itemCount: number;
  numColumns: number;
  itemSpacing: number;
};

export function buildListSnapToOffsets({
  isHeaderFeed,
  headerHeight,
  cardHeight,
  itemCount,
  itemSpacing,
}: ListSnapOffsetsParams): number[] | undefined {
  if (!isHeaderFeed || headerHeight <= 0) return undefined;

  // The separator between header and first video contributes gapSize to the offset.
  // gapSize = itemSpacing - cardHeight (= LIST_ITEM_GAP).
  const gapAfterHeader = itemSpacing - cardHeight;
  const offsets = new Array<number>(itemCount + 1);
  offsets[0] = 0;
  for (let i = 0; i < itemCount; i++) {
    offsets[i + 1] = Math.round(headerHeight + gapAfterHeader + i * itemSpacing);
  }
  return offsets;
}

export function buildGridSnapToOffsets({
  useScrollTracking,
  headerHeight,
  itemCount,
  numColumns,
  itemSpacing,
}: GridSnapOffsetsParams): number[] | undefined {
  if (!useScrollTracking) return undefined;
  if (headerHeight <= 0) return [0];

  const rowCount = itemCount === 0 ? 0 : Math.ceil(itemCount / numColumns);
  const offsets: number[] = [0];

  for (let row = 0; row < rowCount; row++) {
    offsets.push(headerHeight + row * itemSpacing);
  }

  return offsets;
}
