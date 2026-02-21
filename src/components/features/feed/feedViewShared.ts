import type { ReactNode } from 'react';
import type { ExtendedFeedViewPost } from '../../../services/api/types';
import { Colors } from '../../../theme';
import { FEED_TYPES } from '../../../utils/constants';
import type { FeedListItem } from '../../../types';

export const FEED_VIEW_CONSTANTS = {
  SEPARATOR_HEIGHT: 5,
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

export const getFeedItemKey = (item: FeedListItem | ExtendedFeedViewPost): string => {
  if ('endCard' in item && item.endCard) return 'end-card';
  return `${item.post.uri}:${item.post.cid}`;
};

export const getEmptyFeedType = (feedOption: string): 'no-following' | 'no-videos' =>
  feedOption === FEED_TYPES.FOLLOWING ? 'no-following' : 'no-videos';
