import React, { useState, useCallback, useImperativeHandle, forwardRef, memo, useMemo, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { createQueryKeys } from '../../src/services/FeedService';
import { APP_CONSTANTS } from '../../src/utils/constants';
import { SwipeableFeedContainer } from '../../src/components';
import { HomeScreenRef, FeedOption } from '../../src/types';
import { useVisibilityRouteTracker } from '../../src/hooks';
import { Colors } from '../../src/components/ui/UI';
import { useSubscribedChannels } from '../../src/hooks/useSubscribedChannels';

interface HomeScreenProps {}

const HomeScreen = memo(forwardRef<HomeScreenRef, HomeScreenProps>((props, ref) => {
  const { subscribedChannels } = useSubscribedChannels();
  const defaultFeed = useMemo(() => {
    const defaultChannel = subscribedChannels.find(ch => ch.isDefault);
    return defaultChannel?.uri || subscribedChannels[0]?.uri;
  }, [subscribedChannels]);
  const [currentFeed, setCurrentFeed] = useState<FeedOption>(defaultFeed);
  
  useEffect(() => {
    if (defaultFeed) {
      setCurrentFeed(defaultFeed);
    }
  }, [defaultFeed]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();
  useVisibilityRouteTracker('home', 'index');

  const triggerRefresh = useCallback(() => {
    setIsRefreshing(true);

    // Smart refresh: only invalidate current feed, preserve other feeds and video cache
    queryClient.invalidateQueries({ 
      queryKey: createQueryKeys.feed.infinite(currentFeed),
      exact: false // Invalidate all related queries for this feed
    });

    // Don't force remount - preserve video states and scroll positions
    // Only refresh the data, not the entire component tree

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

  // Smart refresh logic: only refresh when explicitly requested
  // No automatic refresh on tab focus to preserve video cache and user experience

  // Memoized feed change handler
  const handleFeedChange = useCallback((newFeed: FeedOption) => {
    setCurrentFeed(newFeed);
  }, []);

  return (
    <View style={styles.container}>
      <SwipeableFeedContainer
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

