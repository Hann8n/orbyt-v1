import React, { useMemo, useCallback, memo } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

import FeedRenderer from '../../src/components/features/feed/FeedRenderer';

import { BackArrowIcon } from '../../src/components/ui/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../src/components/ui/UI';
import { useVisibilityRouteTracker, useVisibilityRouteIsActive } from '../../src/hooks';
import { hashtagToChannelSlug } from '../../src/utils/orbytChannels';

const FeedScreen: React.FC = memo(() => {
  const navigation = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  useVisibilityRouteTracker('feed-modal');
  const isRouteFocused = useVisibilityRouteIsActive('feed-modal');
  
  // Memoized route params extraction - simplified, removed initial position tracking
  const routeParams = useMemo(() => {
    return {
      feed: params.feed as string,
      feedOption: params.feedOption as string,
      userDid: params.userDid as string,
      backgroundColor: params.backgroundColor as string,
      secondaryColor: params.secondaryColor as string,
      searchQuery: params.searchQuery as string,
      hasNextPage: params.hasNextPage === 'true',
      isFetchingNextPage: params.isFetchingNextPage === 'true',
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
  const hashtag = isHashtagFeed ? routeParams.feedOption.substring(8) : null;
  // Check if this is an orbyt channel hashtag (don't show header for orbyt channels)
  const isOrbytChannelHashtag = hashtag ? hashtagToChannelSlug(routeParams.feedOption || '') !== null : false;

  // Memoized close handler
  const handleClose = useCallback(() => {
    // Try navigation.back() first, fallback to replace if it fails
    try {
      navigation.back();
    } catch (error) {
      navigation.replace('/(tabs)');
    }
  }, [navigation]);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => {
          handleClose();
        }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={[styles.backButton, { top: insets.top + 15 }]}
        activeOpacity={0.7}
      >
        <BackArrowIcon size={30} color={Colors.white} />
      </TouchableOpacity>
      
      {/* Show hashtag header if this is a hashtag feed (but not for orbyt channels) */}
      {isHashtagFeed && hashtag && !isOrbytChannelHashtag && (
        <Text style={[styles.hashtagHeader, { top: insets.top + 15 }]}>
          #{hashtag}
        </Text>
      )}
      
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
      />
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
    left: 64, // Start after the back button area (20 + 44 for button width)
    right: 64, // Same spacing on both sides for proper centering
    textAlign: 'center',
    fontSize: 18,
    color: Colors.white,
    fontFamily: 'Firma-Bold',
    zIndex: 10,
    paddingTop: 5, // Perfect vertical alignment with back button icon center
    includeFontPadding: false, // Remove default font padding for precise alignment
    textAlignVertical: 'center',
  },
});

export default FeedScreen;