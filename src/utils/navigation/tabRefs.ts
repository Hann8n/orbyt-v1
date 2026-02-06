// Simple ref registry for tab screens to enable double-tap scroll-to-top
export interface ScrollToTopRef {
  scrollToTop: () => void;
}

/** Profile tab uses FeedPager; ref can switch page when tabs are tapped */
export interface ProfileRef extends ScrollToTopRef {
  setPage: (index: number) => void;
}

export interface HomeRef extends ScrollToTopRef {
  refresh: () => void;
}

export interface ExploreRef {
  scrollToTop: () => void;
  dismissSearch: () => void;
  isSearchActive: () => boolean;
  focusSearch?: () => void;
}

export const tabRefs = {
  home: null as HomeRef | null,
  explore: null as ExploreRef | null,
  activity: null as ScrollToTopRef | null,
  profile: null as ProfileRef | null,
};
