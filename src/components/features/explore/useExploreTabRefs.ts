import { useRef, useLayoutEffect } from 'react';
import type { FlashListRef } from '@shopify/flash-list';
import { useScrollToTop } from 'expo-router/react-navigation';

import type { ListItem } from './types';

type Params = {
  flashListRef: React.RefObject<FlashListRef<ListItem> | null>;
  resetExploreSearch: () => void;
  isSearching: boolean;
};

export function useExploreTabRefs({ flashListRef, resetExploreSearch, isSearching }: Params) {
  // Keep a stable ref to the current isSearching value so the scrollToTop closure
  // never becomes stale without needing to re-register the hook.
  const isSearchingRef = useRef(isSearching);
  useLayoutEffect(() => {
    isSearchingRef.current = isSearching;
  }, [isSearching]);

  // When the explore tab is tapped while already focused, dismiss an active search
  // first; otherwise scroll the list back to top.
  const scrollToTopRef = useRef({
    scrollToTop: () => {
      if (isSearchingRef.current) {
        resetExploreSearch();
      } else {
        flashListRef.current?.scrollToTop({ animated: true });
      }
    },
  });
  useScrollToTop(scrollToTopRef);
}
