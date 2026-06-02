import React, { createContext, useContext } from 'react';
import type { SharedValue } from 'react-native-reanimated';

/**
 * Scroll-linked layout for list feeds (`ListFeedView`) and grid surfaces (`FeedScrollProvider`).
 *
 * Split into motion (stable SharedValues) vs layout (header/viewport/spacing) so
 * layout-only React updates do not re-render consumers that only need scroll values.
 */
export interface FeedScrollMotionValue {
  scrollOffsetYSV: SharedValue<number>;
  contentScrollProgressSV?: SharedValue<number>;
}

export interface FeedScrollLayoutValue {
  headerHeight: number;
  viewportHeight: number;
  itemSpacing: number;
  snapTopInset: number;
}

const FeedScrollMotionContext = createContext<FeedScrollMotionValue | null>(null);
const FeedScrollLayoutContext = createContext<FeedScrollLayoutValue | null>(null);

export function FeedScrollProvider({
  motion,
  layout,
  children,
}: {
  motion: FeedScrollMotionValue;
  layout: FeedScrollLayoutValue;
  children: React.ReactNode;
}) {
  return (
    <FeedScrollMotionContext.Provider value={motion}>
      <FeedScrollLayoutContext.Provider value={layout}>{children}</FeedScrollLayoutContext.Provider>
    </FeedScrollMotionContext.Provider>
  );
}

/** Shared scroll values — stable `motion` object avoids re-renders when only layout scalars change. */
export function useFeedScrollMotion(): FeedScrollMotionValue | null {
  return useContext(FeedScrollMotionContext);
}

/** Header height, viewport, item spacing — updates when list layout changes. */
export function useFeedScrollLayout(): FeedScrollLayoutValue | null {
  return useContext(FeedScrollLayoutContext);
}
