import React, { useState, useCallback, useRef, useImperativeHandle, forwardRef, useEffect, useMemo, memo } from 'react';
import { BORDER_RADIUS } from '../../src/utils/constants';
import { View, StyleSheet, StatusBar, Platform, Dimensions, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { useUserStore } from '../../src/stores/userStore';
import { useChannelColors } from '../../src/services/cache/ChannelCache';
import { useProfile } from '../../src/services/cache/ProfileCache';
import { extractColorsFromImage } from '../../src/utils/formatting/colorUtils';
import { getViewportDimensions, isSmallScreen } from '../../src/utils/helpers';
import { Colors } from '../../src/components/ui/UI';
import { Avatar, Icon } from '../../src/components/ui/UI';
import { TabNavigation, TabOption } from '../../src/components/layout/header';
import FeedRenderer from '../../src/components/features/feed/FeedRenderer';
import { useGlobalCommentSection, useGlobalShareSheet } from '../../src/hooks/useGlobalModals';
import { createQueryKeys } from '../../src/services/FeedService';
import { APP_CONSTANTS } from '../../src/utils/constants';
import { SwipeableFeedContainer } from '../../src/components';
import { HomeScreenRef, FeedOption } from '../../src/types';

interface HomeScreenProps {}

const HomeScreen = memo(forwardRef<HomeScreenRef, HomeScreenProps>((props, ref) => {
  const [currentFeed, setCurrentFeed] = useState<FeedOption>('yourMix');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();
  const navigation = useRouter();
  

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

