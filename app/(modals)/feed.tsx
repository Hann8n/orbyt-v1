import { useMemo, useCallback, memo } from 'react';
import { View, StyleSheet, Pressable, Text } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

import FeedRenderer from '../../src/components/features/feed/FeedRenderer';

import { BackArrowIcon } from '../../src/components/ui/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../src/components/ui/UI';
import { useVisibilityRouteTracker, useVisibilityRouteIsActive } from '../../src/hooks';

const FeedScreen = memo(() => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  useVisibilityRouteTracker('feed-modal');
  const isRouteFocused = useVisibilityRouteIsActive('feed-modal');

  // Memoized route params extraction - includes initial index for scrolling to selected video
  const routeParams = useMemo(() => {
    const initialIndex = params.initialIndex ? parseInt(params.initialIndex as string, 10) : null;
    const validInitialIndex = initialIndex !== null && !isNaN(initialIndex) ? initialIndex : null;
    return {
      feed: params.feed as string,
      feedOption: params.feedOption as string,
      userDid: params.userDid as string,
      backgroundColor: params.backgroundColor as string,
      secondaryColor: params.secondaryColor as string,
      searchQuery: params.searchQuery as string,
      hasNextPage: params.hasNextPage === 'true',
      isFetchingNextPage: params.isFetchingNextPage === 'true',
      initialIndex: validInitialIndex,
    };
  }, [params]);

  const modalQueryOptions = useMemo(
    () => ({
      staleTime: 5 * 60 * 1000,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
    }),
    []
  );

  // Check if this is a hashtag feed
  const isHashtagFeed = routeParams.feedOption?.startsWith('hashtag:');
  const hashtagWithSort = isHashtagFeed ? routeParams.feedOption.substring(8) : null;
  // Extract hashtag without sort suffix (e.g., "art:top" -> "art")
  const hashtag = hashtagWithSort ? hashtagWithSort.split(':')[0] : null;
  // Check if this is an orbyt channel hashtag (don't show header for orbyt channels)
  // Orbyt channel hashtags start with "orbyt-channel-" or "orbyt-"
  const isOrbytChannelHashtag = hashtag
    ? hashtag.startsWith('orbyt-channel-') || hashtag.startsWith('orbyt-')
    : false;

  // Memoized close handler
  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => {
          handleClose();
        }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={[
          styles.backButton,
          { top: (typeof insets?.top === 'number' ? insets.top : 0) + 15 },
        ]}
      >
        <BackArrowIcon size={30} color={Colors.white} />
      </Pressable>

      <FeedRenderer
        feedOption={routeParams.feedOption}
        userDid={routeParams.userDid}
        backgroundColor={routeParams.backgroundColor || Colors.black}
        secondaryColor={routeParams.secondaryColor}
        isVisible={isRouteFocused} // Only play when this modal has focus
        isModal={true} // Mark as modal for optimized behavior
        searchQuery={routeParams.searchQuery}
        hasNextPage={routeParams.hasNextPage}
        isFetchingNextPage={routeParams.isFetchingNextPage}
        queryOptions={modalQueryOptions}
        targetScrollIndex={routeParams.initialIndex}
      />

      {/* Show hashtag header if this is a hashtag feed (but not for orbyt channels) */}
      {isHashtagFeed && hashtag && !isOrbytChannelHashtag && (
        <View
          style={[
            styles.hashtagHeaderContainer,
            { top: (typeof insets?.top === 'number' ? insets.top : 0) + 15 },
          ]}
        >
          <Text style={styles.hashtagSymbol}>#</Text>
          <Text style={styles.hashtagText}>{hashtag}</Text>
        </View>
      )}
    </View>
  );
});

FeedScreen.displayName = 'FeedScreen';

// Optimized StyleSheet creation outside component
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },

  backButton: {
    position: 'absolute',
    left: 20,
    zIndex: 20, // Higher z-index to ensure it's above hashtag header
  },

  hashtagHeaderContainer: {
    position: 'absolute',
    left: 70, // Account for back button area (20 + 30 icon + 20 spacing)
    right: 70, // Match left padding to center the text
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100, // High z-index to ensure it's above feed content
  },
  hashtagSymbol: {
    fontSize: 18,
    color: Colors.white,
    fontFamily: 'Figtree-Regular',
    includeFontPadding: false,
    lineHeight: 30, // Match icon height for vertical alignment
  },
  hashtagText: {
    fontSize: 18,
    color: Colors.white,
    fontFamily: 'Figtree-SemiBold',
    includeFontPadding: false,
    lineHeight: 30, // Match icon height for vertical alignment
  },
});

export default FeedScreen;
