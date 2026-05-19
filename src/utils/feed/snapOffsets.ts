import { FEED_VIEW_CONSTANTS } from '@/components/features/feed/feedViewShared';

export function buildSimpleSnapOffsets(
  headerHeight: number,
  cardHeight: number,
  itemCount: number
): number[] {
  const interval = cardHeight + FEED_VIEW_CONSTANTS.LIST_ITEM_GAP;
  return Array.from({ length: itemCount + 1 }, (_, i) =>
    i === 0 ? 0 : Math.round(headerHeight + (i - 1) * interval)
  );
}

type GridSnapOffsetsParams = {
  useScrollTracking: boolean;
  headerHeight: number;
  isHeaderFeed: boolean;
  itemCount: number;
  numColumns: number;
  itemSpacing: number;
};

export function buildGridSnapToOffsets({
  useScrollTracking,
  headerHeight,
  isHeaderFeed,
  itemCount,
  numColumns,
  itemSpacing,
}: GridSnapOffsetsParams): number[] | undefined {
  if (!useScrollTracking) return undefined;
  if (headerHeight <= 0) return [0];

  const firstRowY = isHeaderFeed ? headerHeight : headerHeight;
  const rowCount = itemCount === 0 ? 0 : Math.ceil(itemCount / numColumns);
  const offsets: number[] = [0];

  for (let row = 0; row < rowCount; row++) {
    offsets.push(Math.round(firstRowY + row * itemSpacing));
  }

  return offsets;
}
