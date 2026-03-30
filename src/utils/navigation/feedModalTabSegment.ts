import { useSegments } from 'expo-router';

import { useDetailNavTabStore } from '@/stores/detailNavTabStore';

/** Tabs that host the feed + full-height-video stack screens (same component, four routes). */
export const FEED_MODAL_TAB_SEGMENTS = ['home', 'explore', 'activity', 'profile'] as const;

export type FeedModalTabSegment = (typeof FEED_MODAL_TAB_SEGMENTS)[number];

function isFeedModalTabSegment(s: string): s is FeedModalTabSegment {
  return (FEED_MODAL_TAB_SEGMENTS as readonly string[]).includes(s);
}

/**
 * Resolves which tab stack to push onto so the native tab bar stays correct (not root modal).
 * When segments omit `(tabs)` (e.g. chat), falls back to the last focused tab — not always explore.
 */
export function useFeedModalTabSegment(): FeedModalTabSegment {
  const segments = useSegments();
  const lastFocusedTab = useDetailNavTabStore(s => s.lastFocusedDetailNavTab);

  for (const s of segments) {
    if (isFeedModalTabSegment(s)) {
      return s;
    }
  }
  return lastFocusedTab;
}
