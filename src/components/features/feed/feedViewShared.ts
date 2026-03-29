import type { ReactNode } from 'react';
import type { ExtendedFeedViewPost } from '../../../services/api/types';
import { Colors } from '../../../theme';
import { FEED_TYPES } from '../../../utils/constants';
import type { FeedListItem } from '../../../types';
import { blendColors, hexToRGBA, isColorDark } from '../../../utils/formatting/colors';

export const FEED_VIEW_CONSTANTS = {
  /** Space between list videos; grid header/footer strips match this. */
  LIST_ITEM_GAP: 3,
  /** Space between grid thumbnails (borders + row pitch for snap). */
  GRID_CELL_GAP: 2.5,
  HEADER_HEIGHT_TABS: 280,
  HEADER_BLOCKING_THRESHOLD: 250,
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

export const getFeedItemKey = (item: FeedListItem | ExtendedFeedViewPost): string => item.post.uri;

export const getEmptyFeedType = (feedOption: string): 'no-following' | 'no-videos' =>
  feedOption === FEED_TYPES.FOLLOWING ? 'no-following' : 'no-videos';

const normalizeHexRgb = (value: string): string | null => {
  const t = value.trim();
  if (/^#[0-9a-fA-F]{6}$/i.test(t)) return t;
  if (/^#[0-9a-fA-F]{8}$/i.test(t)) return `#${t.slice(1, 7)}`;
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

  if (isColorDark(hex)) {
    const lifted = blendColors(hex, Colors.neutral[200], 0.62);
    if (isColorDark(lifted)) {
      return Colors.neutral[300];
    }
    return hexToRGBA(lifted, 0.94);
  }

  const softened = blendColors(hex, Colors.neutral[0], 0.08);
  return hexToRGBA(softened, 0.92);
};
