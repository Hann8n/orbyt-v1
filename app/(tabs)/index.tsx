import React, { useState, useCallback, useImperativeHandle, forwardRef, memo, useRef, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { createQueryKeys } from '../../src/services/FeedService';
import { APP_CONSTANTS } from '../../src/utils/constants';
import { SwipeableFeedContainer } from '../../src/components';
import { HomeScreenRef, FeedOption } from '../../src/types';
import { useVisibilityRouteTracker } from '../../src/hooks';
import { Colors } from '../../src/components/ui/UI';
import { tabRefs } from '../../src/utils/tabRefs';
import type { ScrollToTopRef } from '../../src/utils/tabRefs';
import { useUserStore } from '../../src/stores/userStore';

interface HomeScreenProps {}

const HomeScreen = memo(forwardRef<HomeScreenRef, HomeScreenProps>((props, ref) => {
  // Home screen always defaults to 'your-mix'
  // Built-in channels ('following' and 'your-mix') are not in subscribedChannels,
  // so we always default to 'your-mix' directly
  const [currentFeed, setCurrentFeed] = useState<FeedOption>('your-mix');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();
  const currentUser = useUserStore(state => state.currentUser);
  useVisibilityRouteTracker('home', 'index');

  const triggerRefresh = useCallback(async () => {
    // Refresh both feeds since home screen can show either 'following' or 'your-mix'
    // Include userDid in query keys since 'following' and 'your-mix' are user-specific
    const userDid = currentUser?.did;
    
    // Use invalidateQueries with refetchType to ensure it refetches active queries
    // This is more reliable than refetchQueries for inactive queries
    queryClient.invalidateQueries({ 
      queryKey: createQueryKeys.feed.infinite('following', userDid),
      exact: false,
      refetchType: 'active' // Only refetch active queries
    });
    queryClient.invalidateQueries({ 
      queryKey: createQueryKeys.feed.infinite('your-mix', userDid),
      exact: false,
      refetchType: 'active' // Only refetch active queries
    });
    
    // Set refreshing state for UI feedback
    setIsRefreshing(true);
    
    // Reset refreshing state after a delay to show refresh animation
    // The actual refetch is handled by React Query and FeedRenderer's useEffect
    setTimeout(() => {
      setIsRefreshing(false);
    }, APP_CONSTANTS.REFRESH_DELAY);
  }, [queryClient, currentUser?.did]);

  // Memoized feed change handler
  const handleFeedChange = useCallback((newFeed: FeedOption) => {
    setCurrentFeed(newFeed);
  }, []);

  // Ref for SwipeableFeedContainer to forward scrollToTop
  const swipeableFeedRef = useRef<ScrollToTopRef>(null);

  // Expose refresh method to parent components
  useImperativeHandle(ref, () => ({
    refresh: triggerRefresh,
    isRefreshing,
  }), [isRefreshing, triggerRefresh]);

  // Store home screen ref in tabRefs for tab navigation
  useEffect(() => {
    tabRefs.home = {
      scrollToTop: () => swipeableFeedRef.current?.scrollToTop(),
      refresh: triggerRefresh,
    };
    return () => {
      tabRefs.home = null;
    };
  }, [triggerRefresh]);

  return (
    <View style={styles.container}>
      <SwipeableFeedContainer
        ref={swipeableFeedRef}
        initialFeed={currentFeed}
        onFeedChange={handleFeedChange}
        isRefreshing={isRefreshing}
        applySafeArea={true}
        indicatorFontSize={18}
      />
    </View>
  );
}));

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
});

export default HomeScreen;

