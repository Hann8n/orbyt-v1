/**
 * Pure visibility helpers for feed rows (testable without React / Zustand).
 */

export interface FeedRowVisibilityInput {
  activeFeedKey: string | null;
  feedKey: string;
  lastViewableIndexByFeed: Record<string, number>;
  index: number;
  isHeaderBlockingPlayback: boolean;
  canPlay: boolean;
}

export interface FeedRowVisibilityResult {
  isActiveFeed: boolean;
  isViewable: boolean;
  isVisible: boolean;
  allowPlayback: boolean;
}

export function computeFeedRowVisibility(input: FeedRowVisibilityInput): FeedRowVisibilityResult {
  const isActiveFeed = input.activeFeedKey === input.feedKey;
  const lastIdx = input.lastViewableIndexByFeed[input.feedKey] ?? -1;
  const isViewable = lastIdx === input.index;
  const isVisible = isViewable && !input.isHeaderBlockingPlayback;
  const allowPlayback =
    isViewable && isActiveFeed && input.canPlay && !input.isHeaderBlockingPlayback;
  return { isActiveFeed, isViewable, isVisible, allowPlayback };
}
