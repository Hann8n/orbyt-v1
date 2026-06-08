import type { Href } from 'expo-router';

import type { DetailNavTab } from '@/utils/navigation/detailRoutes';

/**
 * Serializable search params for tab-stack feed routes (`/(tabs)/{tab}/feed`).
 * Values are strings because Expo Router passes route params as strings.
 */
export type FeedModalSearchParams = {
  feedOption: string;
  userDid?: string;
  initialPostUri: string;
};

/** Params for full-height video routes (`/(tabs)/{tab}/full-height-video`, seeded via `feedService.setCurrentFeed`). */
export type FullHeightVideoModalParams = {
  postUri: string;
};

/**
 * Relative `href` for the full-height video screen. Use with `{ relativeToDirectory: true }` (or a
 * `<Link relativeToDirectory>`); Expo Router resolves it to the current tab's `full-height-video`
 * route at press time, so the push always lands on the stack the user is on.
 */
export function buildFullHeightVideoHref(params: FullHeightVideoModalParams): Href {
  return {
    pathname: './full-height-video',
    params: { postUri: params.postUri },
  };
}

/**
 * Relative `href` for the feed stack screen inside a tab. Use with `{ relativeToDirectory: true }`
 * (or a `<Link relativeToDirectory>`) so it resolves against the current tab's stack at press time.
 */
export function buildFeedModalHref(params: FeedModalSearchParams): Href {
  const routeParams: Record<string, string> = {
    feedOption: params.feedOption,
    initialPostUri: params.initialPostUri,
  };
  if (params.userDid) {
    routeParams.userDid = params.userDid;
  }
  return {
    pathname: './feed',
    params: routeParams,
  };
}

/**
 * Absolute feed/full-height-video hrefs for callers that are **not inside a tab stack** (root
 * screens like chat or deep links), where relative resolution has no tab to anchor to. The target
 * tab is passed explicitly (typically `DEFAULT_DETAIL_TAB`).
 */
export function buildAbsoluteFullHeightVideoHref(
  params: FullHeightVideoModalParams,
  tab: DetailNavTab
): Href {
  return {
    pathname: `/(tabs)/${tab}/full-height-video`,
    params: { postUri: params.postUri },
  };
}

export function buildAbsoluteFeedModalHref(params: FeedModalSearchParams, tab: DetailNavTab): Href {
  const routeParams: Record<string, string> = {
    feedOption: params.feedOption,
    initialPostUri: params.initialPostUri,
  };
  if (params.userDid) {
    routeParams.userDid = params.userDid;
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
