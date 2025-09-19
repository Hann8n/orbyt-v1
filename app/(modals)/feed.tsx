import React, { useMemo, useCallback, memo } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

import FeedRenderer from '../../src/components/features/feed/FeedRenderer';

import { BackArrowIcon } from '../../src/components/ui/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { feedService } from '../../src/services/FeedService';
import { getViewportDimensions } from '../../src/utils/helpers';
import { Colors } from '../../src/components/ui/UI';

const FeedScreen: React.FC = memo(() => {
  const navigation = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  
  // Memoized route params extraction
  const routeParams = useMemo(() => {
    return {
      feed: params.feed as string,
      initialIndex: params.initialIndex ? parseInt(params.initialIndex as string) : 0,
      initialUri: params.initialUri as string,
      feedOption: params.feedOption as string,
      userDid: params.userDid as string,
      backgroundColor: params.backgroundColor as string,
      secondaryColor: params.secondaryColor as string,
      searchQuery: params.searchQuery as string,
      hasNextPage: params.hasNextPage === 'true',
      isFetchingNextPage: params.isFetchingNextPage === 'true',
      fetchNextPage: params.fetchNextPage as string,
    };
  }, [params]);

  // Memoized viewport dimensions calculation
  const viewportDimensions = useMemo(() => 
    getViewportDimensions(true, false),
    []
  );
  
  // Memoized initial position calculation
  const initialPosition = useMemo(() => 
    (routeParams.initialIndex || 0) * viewportDimensions.height,
    [routeParams.initialIndex, viewportDimensions.height]
  );

  // Memoized close handler
  const handleClose = useCallback(() => {
    feedService.clearCurrentFeed();
    navigation.back();
  }, [navigation]);





  return (
    <View style={styles.container}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={handleClose}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={[styles.backButton, { top: insets.top + 15 }]}
        activeOpacity={0.7}
      >
        <BackArrowIcon size={32} color={Colors.white} />
      </TouchableOpacity>
      <FeedRenderer
        feedOption={routeParams.feedOption}
        userDid={routeParams.userDid}
        backgroundColor={routeParams.backgroundColor || Colors.black}
        secondaryColor={routeParams.secondaryColor}
        initialIndex={routeParams.initialIndex}
        initialUri={routeParams.initialUri}
        isVisible={true} // Modal is always visible when open
        isModal={true} // Mark as modal for optimized behavior
        isProfileLoading={false}
        searchQuery={routeParams.searchQuery}
        hasNextPage={routeParams.hasNextPage}
        isFetchingNextPage={routeParams.isFetchingNextPage}
        fetchNextPage={() => {}}
        queryOptions={useMemo(() => ({
          enabled: true, // Always enabled in modal
          staleTime: 5 * 60 * 1000, // 5 minutes
        }), [])}
        ListComponent={undefined}
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
    left: 16,
    zIndex: 10,
  },
});

export default FeedScreen;


