// Simple ref registry for tab screens to enable double-tap scroll-to-top
export interface ScrollToTopRef {
  scrollToTop: () => void;
}

export interface ExploreRef {
  scrollToTop: () => void;
  focusSearch: () => void;
  dismissSearch: () => void;
  isSearchActive: () => boolean;
}

export const tabRefs = {
  home: null as ScrollToTopRef | null,
  explore: null as ExploreRef | null,
  activity: null as ScrollToTopRef | null,
  profile: null as ScrollToTopRef | null,
};

