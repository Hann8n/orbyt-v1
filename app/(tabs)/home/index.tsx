import { useCallback, memo, useRef } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useScrollToTop } from '@react-navigation/native';

import { queryKeys } from '@/utils/query/queryKeys';
import FeedPager from '@/components/features/feed/FeedPager';
import type { FeedOption } from '@/types';
import { Colors } from '@/theme';
import type { FeedPagerRef } from '@/utils/navigation/tabRefs';
import { useUserStore } from '@/stores/userStore';
import { useAppStore } from '@/stores/appStore';
import { VideoUploadBanner } from '@/components/ui/VideoUploadBanner';

function HomeScreenComponent() {
    const currentFeed = useAppStore(s => s.lastHomeFeed);
    const setLastHomeFeed = useAppStore(s => s.setLastHomeFeed);
    const queryClient = useQueryClient();
    const currentUser = useUserStore(state => state.currentUser);
    const feedBootstrapStatus = useUserStore(state => state.feedBootstrapStatus);
    const feedBootstrapDid = useUserStore(state => state.feedBootstrapDid);
    const insets = useSafeAreaInsets();
    const shouldGateHomeFeed =
      !!currentUser?.did &&
      (feedBootstrapStatus !== 'ready' || feedBootstrapDid !== currentUser.did);

    const triggerRefresh = useCallback(async () => {
      // Refresh both feeds since home screen can show either 'following' or 'your-mix'
      // Include userDid in query keys since 'following' and 'your-mix' are user-specific
      const userDid = currentUser?.did;

      // Use invalidateQueries with refetchType to ensure it refetches active queries
      // Prefix matching avoids coupling invalidation to source fingerprint key segments.
      queryClient.invalidateQueries({
        queryKey: queryKeys.feed.byUser('following', userDid ?? undefined),
        exact: false,
        refetchType: 'active', // Only refetch active queries
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.feed.byUser('your-mix', userDid ?? undefined),
        exact: false,
        refetchType: 'active', // Only refetch active queries
      });
    }, [queryClient, currentUser?.did]);

    const handleFeedChange = useCallback(
      (newFeed: FeedOption) => {
        if (newFeed === 'following' || newFeed === 'your-mix') {
          setLastHomeFeed(newFeed);
        }
      },
      [setLastHomeFeed]
    );

    const feedPagerRef = useRef<FeedPagerRef>(null);
    // Wires tab re-press → scrollToTop via Expo Router's react-navigation bridge
    useScrollToTop(feedPagerRef);

    return (
      <View style={styles.container}>
        <VideoUploadBanner topInset={insets.top} applySafeArea={true} />
        {shouldGateHomeFeed ? (
          <View style={styles.bootstrapLoadingContainer}>
            <ActivityIndicator size="large" color={Colors.neutral[50]} />
          </View>
        ) : (
          <FeedPager
            ref={feedPagerRef}
            currentFeed={currentFeed}
            onFeedChange={handleFeedChange}
            applySafeArea={true}
            pullToRefreshEnabled
            onPullToRefreshExtra={triggerRefresh}
          />
        )}
      </View>
    );
}

const HomeScreen = memo(HomeScreenComponent);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
    // Prevent white lines at edges when scrolling under tab bar
    overflow: 'hidden',
  },
  bootstrapLoadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default HomeScreen;
