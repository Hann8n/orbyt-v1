import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import {
  View,
  StyleSheet,
  RefreshControl,
  Dimensions,
  Alert,
  TouchableOpacity,
  Text,
} from 'react-native';
// Use plain FlashList via FeedRenderer; no adapter/converter
import { useNavigation, useRoute } from '@react-navigation/native';


import ChannelHeader from '../components/layout/header/ChannelHeader';
import FeedRenderer from '../components/features/feed/FeedRenderer';
import MembersListView from '../components/features/feed/MembersListView';
import { Colors } from '../components/ui/UI';

import { useChannelColors, useChannel, useChannelColorsMutation } from '../services/cache/ChannelCache';
import ProfileCache from '../services/cache/ProfileCache';
import { extractColorsFromImage } from '../utils/formatting/colorUtils';
import { TabNavigation, TabOption } from '../components/layout/header';
import { useSubscribedChannels } from '../hooks/useSubscribedChannels';
import Icon from '../components/ui/Icon';

interface ChannelScreenProps {
  route: any;
  navigation?: any;
}

const ChannelScreen: React.FC<ChannelScreenProps> = memo(({ route }) => {
  const navigation = useNavigation();
  const { uri, title, description, avatar, creator } = route.params || {};
  
  const [refreshing, setRefreshing] = useState(false);

  // Removed header visibility hook; header remains static and always visible

  // Use channel cache system
  const {
    data: channelData,
    isLoading: isLoadingChannel,
    error: channelError,
    refetch: refetchChannel,
  } = useChannel(uri || '');

  // Force refresh channel data to get experimental flag if not present
  useEffect(() => {
    if (uri && channelData && channelData.isExperimental === undefined) {
      // Invalidate the channel cache to force a fresh fetch
      const invalidateAndRefetch = async () => {
        try {
          const ChannelCache = await import('../services/cache/ChannelCache');
          await ChannelCache.default.invalidateChannel(uri);
          refetchChannel();
        } catch (error) {
          console.error('Error invalidating channel cache:', error);
        }
      };
      invalidateAndRefetch();
    }
  }, [uri, channelData, refetchChannel]);

  const { colors: channelColors } = useChannelColors(uri || '');
  const colorsMutation = useChannelColorsMutation();

  // Tab state
  const [activeTab, setActiveTab] = useState<'posts' | 'members'>('posts');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Header visibility logic removed

  // Use feed query only for posts tab
  const feedOption = uri || '';
  
  // Ensure channel data is immediately available from cache
  const channelDataForFeed = channelData;
  
  // Memoized query options - always enable when tab is selected
  const queryOptions = useMemo(() => ({ 
    enabled: !!feedOption && feedOption.startsWith('at://') && !!channelDataForFeed?.did
  }), [feedOption, channelDataForFeed?.did]);

  // Handle edit (only for owned channels)
  const handleEdit = useCallback((channelId: string) => {
    // TODO: Implement edit functionality
  }, []);

  // Handle delete (only for owned channels)
  const handleDelete = useCallback((channelId: string) => {
    // TODO: Implement delete functionality
  }, []);

  // Extract and save channel colors if needed
  const extractAndSaveColors = useCallback(async (channelUri: string, avatarUrl: string) => {
    try {
      const colors = await extractColorsFromImage(avatarUrl);
      colorsMutation.mutate({
        uri: channelUri,
        backgroundColor: colors.backgroundColor,
        foregroundColor: colors.foregroundColor
      });
    } catch (error) {
      console.error("Error extracting/saving channel colors:", error);
    }
  }, [colorsMutation]);

  // Extract colors when channel data is available
  useEffect(() => {
    if (channelData && channelData.avatar && !channelData.channelColors) {
      extractAndSaveColors(channelData.uri, channelData.avatar);
    }
  }, [channelData, extractAndSaveColors]);

  // Preload channel creator profile when channel data is available
  useEffect(() => {
    if (channelData?.creator?.handle) {
      // Preload the creator's profile for better performance when navigating to their profile
      ProfileCache.getProfile(channelData.creator.handle).catch(error => {
        console.warn('Error preloading channel creator profile:', error);
      });
    }
  }, [channelData?.creator?.handle]);

  // Force refresh channel data to get subscriber count if not available
  useEffect(() => {
    if (uri && channelData && !channelData.subscriberCount) {
      // Force refresh to get subscriber count
      const forceRefresh = async () => {
        try {
          const ChannelCache = await import('../services/cache/ChannelCache');
          await ChannelCache.default.forceRefreshChannel(uri);
          refetchChannel();
        } catch (error) {
          console.error('Error force refreshing channel:', error);
        }
      };
      forceRefresh();
    }
  }, [uri, channelData, refetchChannel]);

  // Prepare channel data for header
  const channelHeaderData = useMemo(() => {
    if (!channelData) return null;

    const likeCount = channelData.likeCount || 0;

    return {
      id: uri,
      uri: uri,
      name: channelData.displayName || title || 'Untitled Channel',
      description: channelData.description || description || '',
      avatar: channelData.avatar || avatar,
      likeCount,
      isOwner: false, // TODO: Check if current user owns this channel
      isExperimental: channelData.isExperimental, // Add experimental flag
      creator: channelData.creator || creator, // Use creator from API or fallback to route params
    };
  }, [channelData, uri, title, description, avatar, creator]);

  // Handle back press
  const handleBackPress = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  // Handle refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetchChannel();
    } catch (error) {
      console.error('Error during refresh:', error);
    } finally {
      setRefreshing(false);
    }
  }, [refetchChannel]);

  // Handle end reached for pagination
  const handleEndReached = useCallback(() => {
    // Feed pagination is handled by FeedRenderer
  }, []);

  // Handle retry
  const handleRetry = useCallback(() => {
    // Feed retry is handled by FeedRenderer
  }, []);

  // Handle position change for scroll tracking
  const handlePositionChange = useCallback((position: number) => {
    // Optional: Save scroll position for restoration
    // This can be used to restore the user's position when they return to the screen
  }, []);

  // Memoized tab options
  const tabOptions: TabOption[] = useMemo(() => [
    { id: 'posts', label: 'posts' },
    { id: 'members', label: 'members' },
  ], []);

  // Tracker is provided by hook now

  const showErrorScreen = !!channelError && !refreshing;

  const renderErrorScreen = () => (
    <View style={[styles.errorContainer, { backgroundColor: channelColors.backgroundColor || '#000' }]}> 
      <Icon name="user-x" size={48} color={channelColors.textColor || '#fff'} style={styles.errorIcon} />
      <Text style={[styles.errorText, { color: channelColors.textColor || '#fff' }]}>Channel Not Found</Text>
      <Text style={styles.errorSubtext}>
        {title ? `We couldn't find the channel "${title}"` : "We couldn't retrieve this channel information"}
      </Text>
      <TouchableOpacity
        style={[styles.errorButton, { borderColor: (channelColors.textColor || '#fff') + '44' }]}
        activeOpacity={0.7}
        onPress={onRefresh}
      >
        <Text style={[styles.errorButtonText, { color: channelColors.textColor || '#fff' }]}>Try Again</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.errorButton, styles.secondaryButton, { borderColor: (channelColors.textColor || '#fff') + '44' }]}
        activeOpacity={0.7}
        onPress={() => navigation.goBack()}
      >
        <Text style={[styles.errorButtonText, { color: channelColors.textColor || '#fff' }]}>Go Back</Text>
      </TouchableOpacity>
    </View>
  );

  // Render header component (will be provided to Feed/List as ListHeaderComponent - non-sticky)
  const headerComponent = (
    <View style={styles.headerContainer} pointerEvents="box-none">
      <ChannelHeader
        channel={channelHeaderData}
        showBackButton={true}
        onBackPress={handleBackPress}
        onEdit={handleEdit}
        onDelete={handleDelete}
        applySafeArea={true}
      >
        <TabNavigation
          tabs={tabOptions}
          activeTab={activeTab}
          onTabPress={(tabId) => setActiveTab(tabId as any)}
          textColor={channelColors.textColor}
          backgroundColor="transparent"
          accentColor={channelColors.accentColor}
          viewMode={viewMode}
          onViewModeChange={activeTab === 'posts' ? setViewMode : undefined}
          showViewToggle={activeTab === 'posts'}
        />
      </ChannelHeader>
    </View>
  );

  return (
    <View style={[
      styles.container, 
      { 
        backgroundColor: channelColors.backgroundColor, 
      }
    ]}>
      {showErrorScreen ? (
        renderErrorScreen()
      ) : (
        activeTab === 'posts' ? (
          channelDataForFeed && feedOption.startsWith('at://') ? (
            <FeedRenderer
              feedOption={feedOption.startsWith('at://') ? feedOption : ''}
              userDid={channelDataForFeed?.did}
              headerComponent={headerComponent}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={channelColors.textColor}
                />
              }
              backgroundColor={channelColors.backgroundColor}
              secondaryColor={channelColors.textColor}
              isProfileLoading={isLoadingChannel && !channelDataForFeed}
              isRefreshing={refreshing}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onPositionChange={handlePositionChange}
              initialPosition={undefined}
              // Pass memoized query options
              queryOptions={queryOptions}
              // Header always visible; keep feed active
              isVisible={true}
            />
          ) : (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: channelColors.textColor }}>Loading channel...</Text>
            </View>
          )
        ) : (
          <MembersListView
            channelUri={uri || ''}
            backgroundColor={channelColors.backgroundColor}
            textColor={channelColors.textColor}
            headerComponent={headerComponent}
            isVisible={true}
            onRefresh={onRefresh}
            isRefreshing={refreshing}
          />
        )
      )}
    </View>
  );
});

// Optimized StyleSheet creation outside component
const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    minHeight: '100%', 
    backgroundColor: Colors.black,
    overflow: 'hidden'
  },
  headerContainer: {
    minHeight: 280,
    backgroundColor: 'transparent',
    marginBottom: 0,
    paddingBottom: 0,
  },
  errorContainer: {
    flex: 1, 
    backgroundColor: Colors.black,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    height: Dimensions.get('window').height,
  },
  errorIcon: {
    marginBottom: 16,
    opacity: 0.8,
  },
  errorText: {
    color: Colors.white,
    fontSize: 16,
    textAlign: 'center',
    fontFamily: 'Firma-Medium',
  },
  errorSubtext: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Firma-Medium',
    textAlign: 'center',
    marginBottom: 24,
    maxWidth: '80%',
  },
  errorButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.darkGray,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderWidth: 1,
    marginTop: 20,
    minWidth: 150,
  },
  errorButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Firma-SemiBold',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderColor: Colors.mediumGray,
  },
});

export default ChannelScreen;
