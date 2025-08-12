import React, { useState, useCallback, useRef, useImperativeHandle, forwardRef, useEffect, useMemo, memo } from 'react';
import { View, StyleSheet } from 'react-native';
import SwipeableFeedContainer, { FeedOption } from '../components/features/feed/SwipeableFeedContainer';
import { Colors } from '../components/ui/UI';
import { FORCE_FEED_ERROR } from '../utils/helpers/errorDebug';
import { useQueryClient } from '@tanstack/react-query';
import { createQueryKeys } from '../services/FeedService';
import { useNavigation } from '@react-navigation/native';
 

// Define the ref interface for HomeScreen
export interface HomeScreenRef {
  refresh: () => void;
  isRefreshing: boolean;
}

interface HomeScreenProps {}

const HomeScreen = memo(forwardRef<HomeScreenRef, HomeScreenProps>((props, ref) => {
  const [currentFeed, setCurrentFeed] = useState<FeedOption>('yourMix');
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();
  const navigation = useNavigation();
  

  // Memoized refresh delay timeout to prevent recreation
  const refreshTimeout = useMemo(() => 2000, []);

  const triggerRefresh = useCallback(() => {
    console.log('[HomeScreen] triggerRefresh()');
    // Set refreshing state
    setIsRefreshing(true);

    // Clear cached feed data to ensure a truly fresh fetch across feeds
    console.log('[HomeScreen] Removing feed queries to force fresh data');
    queryClient.removeQueries({ queryKey: createQueryKeys.feed.all });

    // Force a remount of the feed container so all queries initialize fresh
    // This will now preserve the current feed since we pass currentFeed as initialFeed
    console.log('[HomeScreen] Bumping refreshKey to remount SwipeableFeedContainer');
    setRefreshKey(prev => prev + 1);

    // Also explicitly refetch the currently visible feed
    console.log(`[HomeScreen] Explicitly refetching feed: ${currentFeed}`);
    queryClient.refetchQueries({ queryKey: createQueryKeys.feed.infinite(currentFeed) });

    // Reset refreshing state after a short delay
    setTimeout(() => {
      console.log('[HomeScreen] Clearing refreshing state');
      setIsRefreshing(false);
    }, refreshTimeout);
  }, [currentFeed, queryClient, refreshTimeout]);

  // Expose refresh method to parent components
  useImperativeHandle(ref, () => ({
    refresh: () => {
      console.log('[HomeScreen] refresh() called');
      triggerRefresh();
    },
    isRefreshing
  }), [isRefreshing, triggerRefresh]);

  // Listen for tab presses from the parent Tab Navigator to ensure the event is captured
  useEffect(() => {
    const parent = (navigation as any)?.getParent?.();
    const unsubscribe = parent?.addListener?.('tabPress', (e: any) => {
      const isFocused = (navigation as any).isFocused?.() === true;
      console.log('[HomeScreen] parent.tabPress event. homeFocused=', isFocused, ' target=', e?.target);
      if (isFocused) {
        triggerRefresh();
      }
    });
    return unsubscribe;
  }, [navigation, triggerRefresh]);

  // Memoized feed change handler
  const handleFeedChange = useCallback((newFeed: FeedOption) => {
    setCurrentFeed(newFeed);
  }, []);

  return (
    <View style={styles.container}>
      <SwipeableFeedContainer
        key={refreshKey}
        initialFeed={currentFeed}
        onFeedChange={handleFeedChange}
        isRefreshing={isRefreshing}
        forceError={FORCE_FEED_ERROR}
        applySafeArea={true}
      />
    </View>
  );
}));

// Optimized StyleSheet creation outside component
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
});

export default HomeScreen;