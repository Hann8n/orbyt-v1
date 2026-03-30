import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { View } from 'react-native';
import PagerView, { type PagerViewOnPageSelectedEvent } from 'react-native-pager-view';
import type { ExploreSearchTabId, SearchSwipePagerRef } from './types';
import { exploreScreenStyles as styles } from './ExploreScreenStyles';

export type { SearchSwipePagerRef } from './types';

type SearchSwipePagerProps = {
  activeTab: ExploreSearchTabId;
  onActiveTabChange: (tab: ExploreSearchTabId) => void;
  onPageIndexChange?: (index: number) => void;
  renderTabContent: (tabId: ExploreSearchTabId) => React.ReactNode;
  pages: ExploreSearchTabId[];
};

export const SearchSwipePager = forwardRef<SearchSwipePagerRef, SearchSwipePagerProps>(
  ({ activeTab, onActiveTabChange, onPageIndexChange, renderTabContent, pages }, ref) => {
    const pagerViewRef = useRef<PagerView>(null);
    const activeIndex = pages.indexOf(activeTab);

    useImperativeHandle(
      ref,
      () => ({
        setPage: (tabId: ExploreSearchTabId) => {
          const targetIndex = pages.indexOf(tabId);
          if (targetIndex >= 0 && pagerViewRef.current) {
            pagerViewRef.current.setPage(targetIndex);
          }
        },
      }),
      [pages]
    );

    const handlePageSelected = useCallback(
      (event: PagerViewOnPageSelectedEvent) => {
        const index = event.nativeEvent.position;
        onPageIndexChange?.(index);
        const tab = pages[index];
        if (tab && tab !== activeTab) {
          onActiveTabChange(tab);
        }
      },
      [activeTab, pages, onActiveTabChange, onPageIndexChange]
    );

    useEffect(() => {
      const idx = pages.indexOf(activeTab);
      if (idx >= 0 && pagerViewRef.current) {
        pagerViewRef.current.setPage(idx);
      }
    }, [activeTab, pages]);

    return (
      <View style={styles.searchResultsContainer}>
        <PagerView
          ref={pagerViewRef}
          style={styles.pagerView}
          initialPage={activeIndex >= 0 ? activeIndex : 0}
          onPageSelected={handlePageSelected}
          scrollEnabled={true}
          pageMargin={0}
        >
          {pages.map(page => (
            <View key={page} style={styles.pagerPage}>
              {renderTabContent(page)}
            </View>
          ))}
        </PagerView>
      </View>
    );
  }
);
SearchSwipePager.displayName = 'SearchSwipePager';
