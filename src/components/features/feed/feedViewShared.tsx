import { type ReactNode } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import type { ExtendedFeedViewPost } from '../../../services/api/types';
import { Colors } from '../../../theme';
import { FEED_TYPES } from '../../../utils/constants';
import type { FeedListItem } from '../../../types';
import { blendColors, hexToRGBA } from '../../../utils/formatting/colors';

export const FEED_VIEW_CONSTANTS = {
  /** Space between list videos; grid header/footer strips match this. */
  LIST_ITEM_GAP: 3,
  /** Space between grid thumbnails (borders + row pitch for snap). */
  GRID_CELL_GAP: 2.5,
  HEADER_HEIGHT_TABS: 280,
  HEADER_BLOCKING_THRESHOLD: 250,
  HOME_PAGER_CHROME_VISIBLE_MAX_SCROLL_Y: 10,
} as const;

export const isHeaderFeed = (feedOption: string, headerComponent?: ReactNode): boolean =>
  feedOption === FEED_TYPES.PROFILE ||
  feedOption === FEED_TYPES.LIKES ||
  feedOption === FEED_TYPES.REPOSTS ||
  (feedOption && feedOption.startsWith('at://')) ||
  (feedOption && feedOption.startsWith('hashtag:orbyt-channel-')) ||
  Boolean(headerComponent);

export const getProfileColors = (backgroundColor?: string, secondaryColor?: string) =>
  secondaryColor
    ? {
        backgroundColor: backgroundColor || Colors.black,
        textColor: secondaryColor,
      }
    : undefined;

export const getPullToRefreshTintColor = (
  profileTextColor?: string,
  secondaryColor?: string
): string =>
  profileTextColor
    ? blendColors(profileTextColor, Colors.neutral[50], 0.3)
    : secondaryColor || Colors.neutral[50];

export const getFeedItemKey = (item: FeedListItem | ExtendedFeedViewPost, index = 0): string =>
  item.post?.uri ?? item.post?.cid ?? `feed-${index}`;

export const getEmptyFeedType = (feedOption: string): 'no-following' | 'no-videos' =>
  feedOption === FEED_TYPES.FOLLOWING ? 'no-following' : 'no-videos';

const normalizeHexRgb = (value: string): string | null => {
  const t = value.trim();
  if (/^#[0-9a-fA-F]{6}$/i.test(t)) return t;
  if (/^#[0-9a-fA-F]{8}$/i.test(t)) return `#${t.slice(1, 7)}`;
  if (/^#[0-9a-fA-F]{3}$/i.test(t)) {
    const [r, g, b] = [t[1], t[2], t[3]];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return null;
};

/**
 * End-of-feed overscroll hint: prefers profile/secondary text color, adjusted for contrast on dark feeds
 * and a touch more opacity than a “ghost” tint so copy stays readable.
 */
export const getEndOfFeedOverscrollTextColor = (
  profileTextColor?: string,
  secondaryColor?: string
): string => {
  const raw = profileTextColor ?? secondaryColor;
  const hex = raw ? normalizeHexRgb(raw) : null;
  if (!hex) {
    return Colors.neutral[300];
  }

  // Preserve the original dynamic text color direction (dark/light) and only
  // apply alpha for the overscroll hint treatment.
  return hexToRGBA(hex, 0.98);
};

type FeedSurfaceStackProps = {
  listActive: boolean;
  listSurface: ReactNode;
  gridSurface: ReactNode;
};

/** Dual-mount list + grid: visibility, pointers, a11y. `ListFeedView` gates playback / tab bar. */
export function FeedSurfaceStack({ listActive, listSurface, gridSurface }: FeedSurfaceStackProps) {
  const layer = (on: boolean, node: ReactNode) => (
    <View
      collapsable={false}
      style={[feedSurfaceStyles.layer, on ? feedSurfaceStyles.on : feedSurfaceStyles.off]}
      pointerEvents={on ? 'auto' : 'none'}
      importantForAccessibility={on ? 'yes' : 'no-hide-descendants'}
      accessibilityElementsHidden={Platform.OS === 'ios' ? !on : undefined}
    >
      {node}
    </View>
  );

  return (
    <View style={feedSurfaceStyles.root} collapsable={false}>
      {layer(listActive, listSurface)}
      {layer(!listActive, gridSurface)}
    </View>
  );
}

const feedSurfaceStyles = StyleSheet.create({
  root: { flex: 1 },
  layer: { ...StyleSheet.absoluteFillObject },
  on: { opacity: 1, zIndex: 1 },
  off: { opacity: 0, zIndex: 0 },
});
