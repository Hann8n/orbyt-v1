import { useCallback, useImperativeHandle, forwardRef, memo, useRef, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { queryKeys } from '@/utils/query/queryKeys';
import { FeedPager } from '@/components';
import { HomeScreenRef, FeedOption } from '@/types';
import { useVisibilityRouteTracker } from '@/hooks';
import { Colors } from '@/theme';
import { tabRefs } from '@/utils/navigation/tabRefs';
import type { ProfileRef } from '@/utils/navigation/tabRefs';
import { useUserStore } from '@/stores/userStore';
import { useAppStore } from '@/stores/appStore';
import { VideoUploadBanner } from '@/components/ui/VideoUploadBanner';

type HomeScreenProps = Record<string, never>;

const HomeScreen = memo(
  forwardRef<HomeScreenRef, HomeScreenProps>((_props, ref) => {
    const currentFeed = useAppStore(s => s.lastHomeFeed);
    const setLastHomeFeed = useAppStore(s => s.setLastHomeFeed);
    const queryClient = useQueryClient();
    const currentUser = useUserStore(state => state.currentUser);
    const feedBootstrapStatus = useUserStore(state => state.feedBootstrapStatus);
    const feedBootstrapDid = useUserStore(state => state.feedBootstrapDid);
    const insets = useSafeAreaInsets();
    useVisibilityRouteTracker('home');
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

    // Ref for FeedPager to forward scrollToTop (FeedPager exposes ProfileRef)
    const feedPagerRef = useRef<ProfileRef>(null);

    // Expose refresh method to parent components
    useImperativeHandle(
      ref,
      () => ({
        refresh: triggerRefresh,
      }),
      [triggerRefresh]
    );

    // Store home screen ref in tabRefs for tab navigation
    // Tab press handling is now centralized in CustomBottomTabBar - no need for duplicate listener
    useEffect(() => {
      tabRefs.home = {
        scrollToTop: () => feedPagerRef.current?.scrollToTop(),
        refresh: triggerRefresh,
      };
      return () => {
        tabRefs.home = null;
      };
    }, [triggerRefresh]);

    return (
      <View style={styles.container}>
        <VideoUploadBanner topInset={insets.top} applySafeArea={true} />
        {shouldGateHomeFeed ? (
          <View style={styles.bootstrapLoadingContainer}>
            <ActivityIndicator size="small" color={Colors.purple[400]} />
          </View>
        ) : (
          <FeedPager
            ref={feedPagerRef}
            currentFeed={currentFeed}
            onFeedChange={handleFeedChange}
            applySafeArea={true}
            indicatorFontSize={18}
          />
        )}
      </View>
    );
  })
);

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
