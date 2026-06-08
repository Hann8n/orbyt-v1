import { useCallback, memo, useRef, useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from 'expo-router';
import { useIsFocused } from 'expo-router/react-navigation';

import FeedPager from '@/components/features/feed/FeedPager';
import { FeedOption } from '@/types';
import { useVisibilityRouteIsActive } from '@/hooks';
import { Colors } from '@/theme';
import type { FeedPagerRef } from '@/utils/navigation/tabRefs';
import { useUserStore } from '@/stores/userStore';
import { useAppStore } from '@/stores/appStore';
import { VideoUploadBanner } from '@/components/ui/VideoUploadBanner';

const HomeScreen = memo(() => {
  const currentFeed = useAppStore(s => s.lastHomeFeed);
  const setLastHomeFeed = useAppStore(s => s.setLastHomeFeed);
  const currentUser = useUserStore(state => state.currentUser);
  const feedBootstrapStatus = useUserStore(state => state.feedBootstrapStatus);
  const feedBootstrapDid = useUserStore(state => state.feedBootstrapDid);
  const insets = useSafeAreaInsets();
  const isRouteFocused = useVisibilityRouteIsActive('home');
  const shouldGateHomeFeed =
    !!currentUser?.did && (feedBootstrapStatus !== 'ready' || feedBootstrapDid !== currentUser.did);

  const handleFeedChange = useCallback(
    (newFeed: FeedOption) => {
      if (newFeed === 'following' || newFeed === 'your-mix') {
        setLastHomeFeed(newFeed);
      }
    },
    [setLastHomeFeed]
  );

  // Re-selecting the focused home tab scrolls the visible feed to the top and runs the
  // standard pull-to-refresh. tabPress is emitted on the tab navigator (this stack's parent).
  const feedPagerRef = useRef<FeedPagerRef>(null);
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  useEffect(() => {
    const tabNavigation = navigation.getParent();
    if (!tabNavigation) return;
    return tabNavigation.addListener('tabPress' as never, () => {
      if (isFocused) feedPagerRef.current?.refresh();
    });
  }, [navigation, isFocused]);

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
          isVisible={isRouteFocused}
          pullToRefreshEnabled
        />
      )}
    </View>
  );
});

HomeScreen.displayName = 'HomeScreen';

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
