/**
 * What an empty feed shows; shared by the list and grid surfaces.
 */
import { FEED_TYPES } from '../constants';

const getEmptyFeedType = (feedOption: string): 'no-following' | 'no-videos' =>
  feedOption === FEED_TYPES.FOLLOWING ? 'no-following' : 'no-videos';

/**
 * What a feed with no rows shows. `unavailable` is a failure retrying cannot fix (a 4xx such
 * as a deleted or deactivated account, or an unknown feed): the error without a Retry button.
 */
export type FeedEmptyState =
  | 'loading'
  | 'no-connection'
  | 'error'
  | 'unavailable'
  | 'no-following'
  | 'no-videos';

export const getFeedEmptyState = ({
  feedOption,
  isLoading,
  isError,
  isErrorRetryable = true,
  isPaused = false,
}: {
  feedOption: string;
  isLoading: boolean;
  isError: boolean;
  isErrorRetryable?: boolean;
  isPaused?: boolean;
}): FeedEmptyState => {
  // Offline before the first page: React Query holds the fetch until reconnect.
  if (isPaused) return 'no-connection';
  if (isLoading) return 'loading';
  if (isError) return isErrorRetryable ? 'error' : 'unavailable';
  return getEmptyFeedType(feedOption);
};

/**
 * What a full-height video opened from a link shows while it has no post to play. A post that
 * is missing, blocked, filtered or not a video is `unavailable`, like a failure retrying cannot
 * fix; `loading` is the spinner.
 */
export const getLinkedVideoState = (params: {
  isLoading: boolean;
  isError: boolean;
  isErrorRetryable?: boolean;
  isPaused?: boolean;
}): FeedEmptyState => {
  const state = getFeedEmptyState({ ...params, feedOption: '' });
  return state === 'no-videos' || state === 'no-following' ? 'unavailable' : state;
};
