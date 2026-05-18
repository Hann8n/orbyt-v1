import React, { createContext, use } from 'react';
import type { SharedValue } from 'react-native-reanimated';

export interface ScrollFadeParams {
  spacing: number;
  snapOrigin: number;
  firstVideoIdx: number;
}

export interface FeedScrollMotionValue {
  scrollOffsetYSV: SharedValue<number>;
  scrollFadeParamsSV?: SharedValue<ScrollFadeParams>;
}

export interface FeedScrollLayoutValue {
  headerHeight: number;
  viewportHeight: number;
  itemSpacing: number;
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
    <FeedScrollMotionContext value={motion}>
      <FeedScrollLayoutContext value={layout}>{children}</FeedScrollLayoutContext>
    </FeedScrollMotionContext>
  );
}

export function useFeedScrollMotion(): FeedScrollMotionValue | null {
  return use(FeedScrollMotionContext);
}
