import React, { useState, useCallback, useRef, useImperativeHandle, forwardRef, useEffect, useMemo, memo } from 'react';
import { View, StyleSheet } from 'react-native';
import SwipeableFeedContainer from '../components/features/feed/SwipeableFeedContainer';
import { Colors } from '../components/ui/UI';
import { FORCE_FEED_ERROR } from '../utils/helpers/errorDebug';
import { useQueryClient } from '@tanstack/react-query';
import { createQueryKeys } from '../services/FeedService';
import { useNavigation } from '@react-navigation/native';
import { APP_CONSTANTS } from '../utils/constants';
import type { FeedOption, HomeScreenRef } from '../types';

interface HomeScreenProps {}

const HomeScreen = memo(forwardRef<HomeScreenRef, HomeScreenProps>((props, ref) => {
  const [currentFeed, setCurrentFeed] = useState<FeedOption>('yourMix');
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();
  const navigation = useNavigation();
  

  const triggerRefresh = useCallback(() => {
    setIsRefreshing(true);

    // Clear cached feed data to ensure a truly fresh fetch across feeds
    queryClient.removeQueries({ queryKey: createQueryKeys.feed.all });

    // Force a remount of the feed container so all queries initialize fresh
    setRefreshKey(prev => prev + 1);

    // Also explicitly refetch the currently visible feed
    queryClient.refetchQueries({ queryKey: createQueryKeys.feed.infinite(currentFeed) });

    // Reset refreshing state after a short delay
    setTimeout(() => {
      setIsRefreshing(false);
    }, APP_CONSTANTS.REFRESH_DELAY);
  }, [currentFeed, queryClient]);

  // Expose refresh method to parent components
  useImperativeHandle(ref, () => ({
    refresh: triggerRefresh,
    isRefreshing
  }), [isRefreshing, triggerRefresh]);

  // Listen for tab presses from the parent Tab Navigator
  useEffect(() => {
    const parent = (navigation as any)?.getParent?.();
    const unsubscribe = parent?.addListener?.('tabPress', (e: any) => {
      const isFocused = (navigation as any).isFocused?.() === true;
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
});

export default HomeScreen;