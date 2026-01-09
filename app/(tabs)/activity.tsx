import React, { useState, useCallback, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import { tabRefs } from '../../src/utils/navigation/tabRefs';
import { View, Text, StyleSheet, StatusBar, Pressable } from 'react-native';
import PagerView, {
  type PagerViewOnPageScrollEvent,
  type PagerViewOnPageSelectedEvent,
  type PageScrollStateChangedNativeEvent,
} from 'react-native-pager-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '../../src/components/ui/UI';
import { BORDER_RADIUS } from '../../src/utils/constants';
import NotificationsTab from '../../src/components/features/activity/NotificationsTab';
import ChatsTab from '../../src/components/features/activity/ChatsTab';
import NotificationFilterSheet from '../../src/components/features/activity/NotificationFilterSheet';
import { useUnreadCount } from '../../src/hooks/useUnreadCount';
import type { NotificationReason } from '../../src/services/api/types';

// Tab labels
const TAB_LABELS: { [key: string]: string } = {
  notifications: 'notifications',
  chats: 'chats',
};

// Activity Swipeable Pager Component using react-native-pager-view
const ActivitySwipePager = ({
  activeTab,
  onActiveTabChange,
  renderTabContent,
  onScrollProgressChange,
}: {
  activeTab: 'notifications' | 'chats';
  onActiveTabChange: (tab: 'notifications' | 'chats') => void;
  renderTabContent: (tabId: 'notifications' | 'chats') => React.ReactNode;
  onScrollProgressChange?: (progress: number) => void;
}) => {
  const pagerViewRef = useRef<PagerView>(null);
  const pages = useMemo<Array<'notifications' | 'chats'>>(() => ['notifications', 'chats'], []);
  const activeIndex = pages.indexOf(activeTab);

  // Track scroll progress from PagerView's onPageScroll for indicator animation
  const currentPageRef = useRef(activeIndex);
  const hasAppliedInitialIndexRef = useRef(false);
  // Track if user is actively scrolling to prevent programmatic page changes during gestures
  const isUserScrollingRef = useRef(false);
  // Track if the activeTab change came from user gesture (not indicator tap)
  const isUserGestureRef = useRef(false);

  // Set initial page index
  useLayoutEffect(() => {
    if (!hasAppliedInitialIndexRef.current && pages.length > 0) {
      const targetIndex = activeIndex >= 0 ? activeIndex : 0;
      currentPageRef.current = targetIndex;
      onScrollProgressChange?.(targetIndex);
      requestAnimationFrame(() => {
        pagerViewRef.current?.setPage(targetIndex);
      });
      hasAppliedInitialIndexRef.current = true;
    }
  }, [activeIndex, pages.length, onScrollProgressChange]);

  // Sync PagerView page when activeTab changes (e.g., from indicator tap)
  // Only sync if NOT in the middle of a user gesture
  useEffect(() => {
    if (hasAppliedInitialIndexRef.current && pagerViewRef.current && activeIndex >= 0) {
      // Don't sync if user is actively scrolling - let the gesture complete naturally
      if (isUserScrollingRef.current || isUserGestureRef.current) {
        return;
      }
      // Only sync if the page actually changed (indicator tap)
      if (currentPageRef.current !== activeIndex) {
        requestAnimationFrame(() => {
          pagerViewRef.current?.setPage(activeIndex);
        });
      }
    }
  }, [activeIndex]);

  // Handle page scroll from PagerView - update indicator directly from SDK
  // This fires synchronously during scroll, no state batching
  const handlePageScroll = useCallback(
    (event: PagerViewOnPageScrollEvent) => {
      const { position, offset } = event.nativeEvent;
      const progress = position + offset;
      const roundedPosition = Math.round(progress);

      // Update indicator progress directly from SDK - immediate, no batching
      onScrollProgressChange?.(progress);

      // Update active tab immediately during scroll (not waiting for onPageSelected)
      // This makes indicators respond in real-time as user swipes
      if (
        roundedPosition !== currentPageRef.current &&
        roundedPosition >= 0 &&
        roundedPosition < pages.length
      ) {
        currentPageRef.current = roundedPosition;
        const nextTab = pages[roundedPosition];
        if (nextTab && nextTab !== activeTab) {
          // Mark as user gesture to prevent sync effect from interfering
          isUserGestureRef.current = true;
          onActiveTabChange(nextTab);
        }
      }
    },
    [pages, activeTab, onActiveTabChange, onScrollProgressChange]
  );

  // Handle page selection from PagerView - final confirmation after transition completes
  const handlePageSelected = useCallback(
    (event: PagerViewOnPageSelectedEvent) => {
      if (!hasAppliedInitialIndexRef.current) return;

      const nextIndex = event.nativeEvent.position;
      const prevIndex = currentPageRef.current;

      if (nextIndex !== prevIndex) {
        currentPageRef.current = nextIndex;
        // Ensure indicator is at exact position after transition
        onScrollProgressChange?.(nextIndex);
      }

      const nextTab = pages[nextIndex];
      if (nextTab && nextTab !== activeTab) {
        isUserGestureRef.current = true;
        onActiveTabChange(nextTab);
      }

      // Reset user gesture flag after a short delay to allow state to settle
      setTimeout(() => {
        isUserGestureRef.current = false;
      }, 100);
    },
    [activeTab, pages, onActiveTabChange, onScrollProgressChange]
  );

  // Handle scroll state changes from PagerView
  const handlePageScrollStateChanged = useCallback((event: PageScrollStateChangedNativeEvent) => {
    const state = event.nativeEvent.pageScrollState;
    // Track when user starts/stops scrolling
    if (state === 'dragging' || state === 'settling') {
      isUserScrollingRef.current = true;
    } else if (state === 'idle') {
      // Reset scrolling flag after a short delay to ensure gesture is complete
      setTimeout(() => {
        isUserScrollingRef.current = false;
      }, 50);
    }
  }, []);

  const initialPageIndex = activeIndex >= 0 ? activeIndex : 0;

  return (
    <View style={styles.activityContainer}>
      <PagerView
        ref={pagerViewRef}
        style={styles.pagerView}
        initialPage={initialPageIndex}
        onPageSelected={handlePageSelected}
        onPageScroll={handlePageScroll}
        onPageScrollStateChanged={handlePageScrollStateChanged}
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
};

const ActivityScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'notifications' | 'chats'>('notifications');
  // State to trigger indicator re-renders during scroll (doesn't affect feeds) - matches FeedPager
  const [indicatorScrollProgress, setIndicatorScrollProgress] = useState(0);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [filterReasons, setFilterReasons] = useState<NotificationReason[] | undefined>(undefined);
  const insets = useSafeAreaInsets();
  const { notificationsCount, messagesCount } = useUnreadCount();

  const pages = useMemo<Array<'notifications' | 'chats'>>(() => ['notifications', 'chats'], []);

  // Tab content renderer
  const renderTabContent = useCallback(
    (tabId: 'notifications' | 'chats') => {
      if (tabId === 'notifications') {
        return (
          <NotificationsTab
            ref={r => {
              tabRefs.activity = r;
            }}
            filterReasons={filterReasons}
          />
        );
      } else if (tabId === 'chats') {
        return <ChatsTab />;
      }
      return null;
    },
    [filterReasons]
  );
  // Tab press handling is now centralized in CustomBottomTabBar - no need for duplicate listener

  // Get indicator style using PagerView's scroll progress - matches FeedPager exactly
  const getIndicatorStyle = useCallback(
    (tabId: 'notifications' | 'chats') => {
      const tabIndex = pages.indexOf(tabId);
      const isActive = tabId === activeTab;

      // Use state directly for smooth real-time updates during scroll (not ref) - matches FeedPager
      const baseProgress = indicatorScrollProgress;

      // Calculate opacity based on distance from current position - matches FeedPager
      let opacity = 0.75; // Default inactive opacity
      if (isActive) {
        opacity = 1;
      } else {
        // Gradual opacity based on PagerView's scroll progress (real-time from state)
        const distance = Math.abs(baseProgress - tabIndex);
        opacity = Math.max(0.3, 1 - distance * 0.4);
      }

      // Larger font size for activity header tabs
      const indicatorBaseFontSize = 22;

      return {
        color: isActive ? Colors.white : 'rgba(255, 255, 255, 0.75)',
        fontSize: indicatorBaseFontSize,
        marginRight: 8,
        fontWeight: 'bold' as const,
        fontFamily: 'Firma-Black',
        opacity,
      };
    },
    [activeTab, pages, indicatorScrollProgress]
  );

  // Handle indicator tap
  const handleIndicatorTap = useCallback((tabId: 'notifications' | 'chats') => {
    setActiveTab(tabId);
  }, []);

  // Use same opacity as notifications indicator
  const filterButtonOpacity = getIndicatorStyle('notifications').opacity;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={'transparent'} translucent={true} />

      {/* Header with animated tab indicators */}
      <View style={[styles.headerSection, { paddingTop: insets.top }]}>
        <View style={styles.tabSection}>
          <View style={styles.indicatorContainer}>
            {pages.map(tabId => (
              <Pressable
                key={tabId}
                onPress={() => handleIndicatorTap(tabId)}
                style={styles.indicatorItem}
              >
                <View style={styles.badgeContainer}>
                  <Text style={getIndicatorStyle(tabId)}>{TAB_LABELS[tabId] || tabId}</Text>
                  {(tabId === 'notifications'
                    ? Number(notificationsCount) > 0
                    : Number(messagesCount) > 0) && <View style={styles.badge} />}
                </View>
              </Pressable>
            ))}
          </View>
          {filterButtonOpacity > 0.3 && (
            <Pressable
              onPress={() => setShowFilterSheet(true)}
              style={[styles.filterButton, { opacity: filterButtonOpacity }]}
              disabled={filterButtonOpacity < 1}
            >
              <Text style={styles.filterButtonText}>filter</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Tab Content */}
      <ActivitySwipePager
        activeTab={activeTab}
        onActiveTabChange={setActiveTab}
        renderTabContent={renderTabContent}
        onScrollProgressChange={setIndicatorScrollProgress}
      />

      {/* Filter Sheet */}
      <NotificationFilterSheet
        visible={showFilterSheet}
        selectedReasons={filterReasons}
        onDismiss={() => setShowFilterSheet(false)}
        onFilterChange={setFilterReasons}
      />
    </View>
  );
};

export default ActivityScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
    overflow: 'hidden',
  },
  headerSection: {
    backgroundColor: Colors.black,
    paddingHorizontal: 10,
    paddingBottom: 0,
    paddingTop: 0,
    zIndex: 1,
  },
  tabSection: {
    marginTop: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  indicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 4,
    paddingBottom: 4,
    minHeight: 48,
    flex: 1,
  },
  indicatorItem: {
    paddingHorizontal: 4,
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 50,
    height: 32,
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
  filterButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },
  badgeContainer: {
    position: 'relative',
    paddingRight: 2,
    paddingTop: 2,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.badgeGreen,
    borderWidth: 2,
    borderColor: Colors.black,
  },
  activityContainer: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  pagerView: {
    flex: 1,
  },
  pagerPage: {
    width: '100%',
    height: '100%',
  },
});
