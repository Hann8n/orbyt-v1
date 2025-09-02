import React, { useState, useCallback, useRef, useImperativeHandle, forwardRef, useEffect, useMemo, memo } from 'react';
import { BORDER_RADIUS } from '../../src/utils/constants';
import { View, StyleSheet, StatusBar, Platform, Dimensions, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { useFeedSettings, useCurrentUser } from '../../src/stores/userStore';
import { useSubscribedChannels } from '../../src/hooks/useSubscribedChannels';
import { useChannelColors } from '../../src/services/cache/ChannelCache';
import { useProfile } from '../../src/services/cache/ProfileCache';
import { extractColorsFromImage } from '../../src/utils/formatting/colorUtils';
import { getViewportDimensions, isSmallScreen } from '../../src/utils/helpers/screenSize';
import { Colors } from '../../src/components/ui/UI';
import { Avatar, Icon } from '../../src/components/ui/UI';
import { TabNavigation, TabOption } from '../../src/components/layout/header';
import FeedRenderer from '../../src/components/features/feed/FeedRenderer';
import { useGlobalCommentSection } from '../../src/hooks/useGlobalCommentSection';
import { useGlobalShareSheet } from '../../src/hooks/useGlobalShareSheet';
import { createQueryKeys } from '../../src/services/FeedService';
import { APP_CONSTANTS } from '../../src/utils/constants';
import { FORCE_FEED_ERROR } from '../../src/utils/helpers/errorDebug';
import { SwipeableFeedContainer } from '../../src/components';
import { HomeScreenRef, FeedOption } from '../../src/types';

interface HomeScreenProps {}

const HomeScreen = memo(forwardRef<HomeScreenRef, HomeScreenProps>((props, ref) => {
  const [currentFeed, setCurrentFeed] = useState<FeedOption>('yourMix');
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();
  const navigation = useRouter();
  

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

  // Note: Tab press detection is now handled by Expo Router automatically
  // The feed will refresh when the tab becomes focused

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

