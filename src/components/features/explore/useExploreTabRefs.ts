import { useLayoutEffect, type RefObject } from 'react';
import type { TextInput } from 'react-native';
import type { LegendListRef } from '@legendapp/list/react-native';

import { tabRefs } from '@/utils/navigation/tabRefs';
import type { ExploreRef } from '@/utils/navigation/tabRefs';

type Params = {
  listRef: RefObject<LegendListRef | null>;
  searchInputRef: RefObject<TextInput | null>;
  resetExploreSearch: () => void;
  setIsSearchFocused: (v: boolean) => void;
  isSearching: boolean;
};

export function useExploreTabRefs({
  listRef,
  searchInputRef,
  resetExploreSearch,
  setIsSearchFocused,
  isSearching,
}: Params) {
  useLayoutEffect(() => {
    tabRefs.explore = {
      scrollToTop: () => {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      },
      dismissSearch: () => {
        resetExploreSearch();
      },
      isSearchActive: () => isSearching,
      focusSearch: () => {
        setIsSearchFocused(true);
        searchInputRef.current?.focus();
      },
    } as ExploreRef;

    return () => {
      tabRefs.explore = null;
    };
  }, [listRef, isSearching, resetExploreSearch, searchInputRef, setIsSearchFocused]);
}
