import type { Href } from 'expo-router';

import type { FeedModalTabSegment } from '@/utils/navigation/feedModalTabSegment';

/**
 * Serializable search params for tab-stack feed routes (`/(tabs)/{tab}/feed`).
 * Values are strings because Expo Router passes route params as strings.
 */
export type FeedModalSearchParams = {
  feedOption: string;
  userDid?: string;
  initialIndex: string;
  initialPostUri: string;
  hasNextPage?: string;
  isFetchingNextPage?: string;
  feed?: string;
  backgroundColor?: string;
  secondaryColor?: string;
};

/** Params for full-height video routes (`/(tabs)/{tab}/full-height-video`, seeded via `feedService.setCurrentFeed`). */
export type FullHeightVideoModalParams = {
  postUri: string;
};

/** Typed `href` for the full-height video screen (push on current tab’s stack when possible). */
export function buildFullHeightVideoHref(
  params: FullHeightVideoModalParams,
  tab: FeedModalTabSegment = 'explore'
): Href {
  return {
    pathname: `/(tabs)/${tab}/full-height-video`,
    params: { postUri: params.postUri },
  };
}

/** Typed `href` for the feed stack screen inside a tab. */
export function buildFeedModalHref(
  params: FeedModalSearchParams,
  tab: FeedModalTabSegment = 'explore'
): Href {
  const routeParams: Record<string, string> = {
    feedOption: params.feedOption,
    initialIndex: params.initialIndex,
    initialPostUri: params.initialPostUri,
  };
  if (params.userDid) {
    routeParams.userDid = params.userDid;
  }
  if (params.hasNextPage !== undefined) {
    routeParams.hasNextPage = params.hasNextPage;
  }
  if (params.isFetchingNextPage !== undefined) {
    routeParams.isFetchingNextPage = params.isFetchingNextPage;
  }
  if (params.feed) {
    routeParams.feed = params.feed;
  }
  if (params.backgroundColor) {
    routeParams.backgroundColor = params.backgroundColor;
  }
  if (params.secondaryColor) {
    routeParams.secondaryColor = params.secondaryColor;
  }
  return {
    pathname: `/(tabs)/${tab}/feed`,
    params: routeParams,
  };
}

/**
 * iOS grid → tab stack feed: `Link` + `Link.AppleZoom` source configuration.
 */
export interface GridFeedModalZoomConfig {
  buildHref: (index: number) => Href;
  onBeforeNavigate: (index: number) => void;
}
