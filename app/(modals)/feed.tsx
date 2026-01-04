import React, { useMemo, useCallback, memo } from 'react';
import { View, StyleSheet, Pressable, Text } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

import FeedRenderer from '../../src/components/features/feed/FeedRenderer';

import { BackArrowIcon } from '../../src/components/ui/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../src/components/ui/UI';
import { useVisibilityRouteTracker, useVisibilityRouteIsActive } from '../../src/hooks';

const FeedScreen: React.FC = memo(() => {
  const navigation = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  useVisibilityRouteTracker('feed-modal');
  const isRouteFocused = useVisibilityRouteIsActive('feed-modal');
  
  // Memoized route params extraction - includes initial index for scrolling to selected video
  const routeParams = useMemo(() => {
    const initialIndex = params.initialIndex ? parseInt(params.initialIndex as string, 10) : null;
    return {
      feed: params.feed as string,
      feedOption: params.feedOption as string,
      userDid: params.userDid as string,
      backgroundColor: params.backgroundColor as string,
      secondaryColor: params.secondaryColor as string,
      searchQuery: params.searchQuery as string,
      hasNextPage: params.hasNextPage === 'true',
      isFetchingNextPage: params.isFetchingNextPage === 'true',
      initialIndex: isNaN(initialIndex as number) ? null : initialIndex,
    };
  }, [params]);

  const modalQueryOptions = useMemo(() => ({
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  }), []);

  const modalVisibilityKey = useMemo(() => {
    const keyParts = ['modal', routeParams.feedOption || 'feed'];
    if (routeParams.userDid) {
      keyParts.push(routeParams.userDid);
    }
    return keyParts.join(':');
  }, [routeParams.feedOption, routeParams.userDid]);

  // Check if this is a hashtag feed
  const isHashtagFeed = routeParams.feedOption?.startsWith('hashtag:');
  const hashtagWithSort = isHashtagFeed ? routeParams.feedOption.substring(8) : null;
  // Extract hashtag without sort suffix (e.g., "art:top" -> "art")
  const hashtag = hashtagWithSort ? hashtagWithSort.split(':')[0] : null;
  // Check if this is an orbyt channel hashtag (don't show header for orbyt channels)
  // Orbyt channel hashtags start with "orbyt-channel-" or "orbyt-"
  const isOrbytChannelHashtag = hashtag ? (hashtag.startsWith('orbyt-channel-') || hashtag.startsWith('orbyt-')) : false;

  // Memoized close handler - use dismissTo for reliable modal dismissal
  const handleClose = useCallback(() => {
    // Use dismissTo to dismiss modal stack back to tabs
    navigation.dismissTo?.('/(tabs)') || navigation.back();
  }, [navigation]);

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => {
          handleClose();
        }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={[styles.backButton, { top: (typeof insets?.top === 'number' ? insets.top : 0) + 15 }]}
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
        isProfileLoading={false}
        searchQuery={routeParams.searchQuery}
        hasNextPage={routeParams.hasNextPage}
        isFetchingNextPage={routeParams.isFetchingNextPage}
        fetchNextPage={() => {}}
        queryOptions={modalQueryOptions}
        ListComponent={undefined}
        visibilityKey={modalVisibilityKey}
        targetScrollIndex={routeParams.initialIndex}
      />
      
      {/* Show hashtag header if this is a hashtag feed (but not for orbyt channels) */}
      {isHashtagFeed && hashtag && !isOrbytChannelHashtag && (
        <Text style={[styles.hashtagHeader, { top: (typeof insets?.top === 'number' ? insets.top : 0) + 15 }]}>
          #{hashtag}
        </Text>
      )}
    </View>
  );
});

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

  hashtagHeader: {
    position: 'absolute',
    left: 70, // Account for back button area (20 + 30 icon + 20 spacing)
    right: 70, // Match left padding to center the text
    textAlign: 'center',
    fontSize: 18,
    color: Colors.white,
    fontFamily: 'Firma-Bold',
    zIndex: 100, // High z-index to ensure it's above feed content
    includeFontPadding: false, // Remove default font padding for precise alignment
    lineHeight: 30, // Match icon height for vertical alignment
  },
});

export default FeedScreen;