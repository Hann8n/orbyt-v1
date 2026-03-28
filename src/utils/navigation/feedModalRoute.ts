import type { Href } from 'expo-router';

/**
 * Serializable search params for `/(modals)/feed`.
 * Values are strings because Expo Router passes route params as strings.
 */
export type FeedModalSearchParams = {
  feedOption: string;
  userDid?: string;
  backgroundColor: string;
  secondaryColor: string;
  initialIndex: string;
  initialPostUri: string;
  hasNextPage?: string;
  isFetchingNextPage?: string;
  feed?: string;
};

/** Params for `/(modals)/full-height-video` (single post, seeded via `feedService.setCurrentFeed`). */
export type FullHeightVideoModalParams = {
  postUri: string;
};

/** Typed `href` for the full-height video modal route. */
export function buildFullHeightVideoHref(params: FullHeightVideoModalParams): Href {
  return {
    pathname: '/(modals)/full-height-video',
    params: { postUri: params.postUri },
  };
}

/** Typed `href` for the feed modal route. */
export function buildFeedModalHref(params: FeedModalSearchParams): Href {
  const routeParams: Record<string, string> = {
    feedOption: params.feedOption,
    backgroundColor: params.backgroundColor,
    secondaryColor: params.secondaryColor,
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
  return {
    pathname: '/(modals)/feed',
    params: routeParams,
  };
}

/**
 * iOS grid → feed modal: `Link` + `Link.AppleZoom` source configuration.
 */
export interface GridFeedModalZoomConfig {
  buildHref: (index: number) => Href;
  onBeforeNavigate: (index: number) => void;
}
