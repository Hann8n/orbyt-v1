import { useLayoutEffect, type RefObject } from 'react';
import type { TextInput } from 'react-native';
import type { FlashListRef } from '@shopify/flash-list';

import { tabRefs } from '@/utils/navigation/tabRefs';
import type { ExploreRef } from '@/utils/navigation/tabRefs';

import type { ListItem } from './types';

type Params = {
  flashListRef: RefObject<FlashListRef<ListItem> | null>;
  searchInputRef: RefObject<TextInput | null>;
  resetExploreSearch: () => void;
  setIsSearchFocused: (v: boolean) => void;
  isSearching: boolean;
};

export function useExploreTabRefs({
  flashListRef,
  searchInputRef,
  resetExploreSearch,
  setIsSearchFocused,
  isSearching,
}: Params) {
  useLayoutEffect(() => {
    tabRefs.explore = {
      scrollToTop: () => {
        flashListRef.current?.scrollToTop({ animated: true });
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
  }, [flashListRef, isSearching, resetExploreSearch, searchInputRef, setIsSearchFocused]);
}
