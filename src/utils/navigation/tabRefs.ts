export interface ScrollToTopRef {
  scrollToTop: () => void;
}

/** Ref exposed by {@link FeedPager} (scroll-to-top + programmatic tab index). */
export interface FeedPagerRef extends ScrollToTopRef {
  setPage: (index: number) => void;
}
