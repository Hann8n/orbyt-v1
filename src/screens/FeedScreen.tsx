import React, { useMemo, useCallback, memo } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Tabs } from 'react-native-collapsible-tab-view';
import FeedRenderer from '../components/features/feed/FeedRenderer';
import UniversalHeader from '../components/layout/header/UniversalHeader';
import { BackArrowIcon } from '../components/ui/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { feedService } from '../services/FeedService';
import { getViewportDimensions } from '../utils/helpers/screenSize';
import { Colors } from '../components/ui/UI';

const FeedScreen: React.FC = memo(() => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const route = useRoute<any>();
  
  // Memoized route params extraction
  const routeParams = useMemo(() => {
    const params = route.params || {};
    return {
      feed: params.feed,
      initialIndex: params.initialIndex,
      initialUri: params.initialUri,
      feedOption: params.feedOption,
      userDid: params.userDid,
      backgroundColor: params.backgroundColor,
      secondaryColor: params.secondaryColor,
      searchQuery: params.searchQuery,
      hasNextPage: params.hasNextPage,
      isFetchingNextPage: params.isFetchingNextPage,
      fetchNextPage: params.fetchNextPage,
    };
  }, [route.params]);

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
    navigation.goBack();
  }, [navigation]);

  // Memoized header component for collapsible header demo
  const renderDemoHeader = useCallback(() => (
    <View style={styles.headerContainer} pointerEvents="box-none">
      <UniversalHeader
        content={{
          title: 'Feed Demo',
          subtitle: 'Collapsible Header Example',
          description: 'This demonstrates the new collapsible header support in ListFeedView using react-native-collapsible-tab-view',
        }}
        showBackButton={true}
        onBackPress={handleClose}
        backgroundColor={routeParams.backgroundColor || Colors.black}
        textColor={routeParams.secondaryColor || Colors.white}
        showGradient={true}
        applySafeArea={true}
      />
    </View>
  ), [handleClose, routeParams.backgroundColor, routeParams.secondaryColor]);

  // Check if we should use collapsible header (for demo purposes)
  const useCollapsibleHeader = routeParams.feedOption?.includes('demo') || false;

  return (
    <View style={styles.container}>
      {!useCollapsibleHeader && (
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
      )}
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
        fetchNextPage={routeParams.fetchNextPage}
        queryOptions={useMemo(() => ({
          enabled: true, // Always enabled in modal
          staleTime: 5 * 60 * 1000, // 5 minutes
        }), [])}
        // Collapsible header demo
        useCollapsibleHeader={useCollapsibleHeader}
        renderTabsHeader={useCollapsibleHeader ? renderDemoHeader : undefined}
        headerHeight={280}
        tabName="demo-feed"
        ListComponent={useCollapsibleHeader ? Tabs.FlashList : undefined}
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
  headerContainer: {
    minHeight: 280,
    backgroundColor: 'transparent',
    marginBottom: 0,
    paddingBottom: 0,
  },
  closeButton: {
    position: 'absolute',
    top: 48,
    right: 24,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 24,
    padding: 8,
  },
  backButton: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
  },
  swipeIndicator: {
    position: 'absolute',
    top: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  swipeBar: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
  },
});

export default FeedScreen;


