import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  RefreshControl,
  Dimensions,
  Alert,
  TouchableOpacity,
  Text,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import AtprotoService from '../services/api/AtprotoService';
import { queryKeys } from '../services/queryKeys';
import ChannelHeader from '../components/layout/header/ChannelHeader';
import FeedFetcher from '../components/features/feed/FeedFetcher';
import MembersListView from '../components/features/feed/MembersListView';
import { BRAND, TEXT } from '../utils/formatting/Colors';
import EmptyFeed from '../components/features/feed/EmptyFeed';
import { useChannelColors, useChannel, useChannelColorsMutation } from '../services/cache/ChannelCache';
import { extractColorsFromImage } from '../utils/formatting/colorUtils';
import { TabNavigation, TabOption } from '../components/layout/header';
import { useSubscribedChannels } from '../hooks/useSubscribedChannels';
import { useFeedQuery } from '../hooks/useFeedQuery';
import Icon from '../components/ui/Icon';

interface ChannelScreenProps {
  route: any;
  navigation?: any;
}

const ChannelScreen: React.FC<ChannelScreenProps> = ({ route }) => {
  const navigation = useNavigation();
  const { uri, title, description, avatar, creator } = route.params || {};
  const [refreshing, setRefreshing] = useState(false);
  const { 
    addToMix,
    removeFromMix,
    excludeChannel,
    includeChannel,
    channelsInMix,
    excludedChannels,
  } = useSubscribedChannels();

  // Use channel cache system
  const {
    data: channelData,
    isLoading: isLoadingChannel,
    error: channelError,
    refetch: refetchChannel,
  } = useChannel(uri || '');

  const { colors: channelColors } = useChannelColors(uri || '');
  const colorsMutation = useChannelColorsMutation();

  // Tab state
  const [activeTab, setActiveTab] = useState<'posts' | 'members'>('posts');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Use feed query only for posts tab
  const feedOption = uri || '';
  const {
    feed,
    isProfileFeed,
    error: feedError,
    isLoading: isLoadingFeed,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    refetch: refetchFeed,
    isPaused,
    isError: isFeedError
  } = useFeedQuery(feedOption, undefined, {
    enabled: !!uri && activeTab === 'posts',
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // Check if channel is in mix or excluded
  const isInMix = useMemo(() => {
    return channelsInMix.some(ch => ch.uri === uri);
  }, [channelsInMix, uri]);

  const isExcluded = useMemo(() => {
    return excludedChannels.some(ch => ch.uri === uri);
  }, [excludedChannels, uri]);



  // Handle mix controls
  const handleAddToMix = useCallback(async () => {
    if (!uri) return;
    
    try {
      await addToMix(uri);
    } catch (error) {
      console.error('Error adding to mix:', error);
    }
  }, [uri, addToMix]);

  const handleRemoveFromMix = useCallback(async () => {
    if (!uri) return;
    
    try {
      await removeFromMix(uri);
    } catch (error) {
      console.error('Error removing from mix:', error);
    }
  }, [uri, removeFromMix]);

  const handleExcludeChannel = useCallback(async () => {
    if (!uri) return;
    
    try {
      await excludeChannel(uri);
    } catch (error) {
      console.error('Error excluding channel:', error);
    }
  }, [uri, excludeChannel]);

  const handleIncludeChannel = useCallback(async () => {
    if (!uri) return;
    
    try {
      await includeChannel(uri);
    } catch (error) {
      console.error('Error including channel:', error);
    }
  }, [uri, includeChannel]);

  // Handle edit (only for owned channels)
  const handleEdit = useCallback((channelId: string) => {
    // TODO: Implement edit functionality
    console.log('Edit channel:', channelId);
  }, []);

  // Handle delete (only for owned channels)
  const handleDelete = useCallback((channelId: string) => {
    // TODO: Implement delete functionality
    console.log('Delete channel:', channelId);
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
      
      // Only refetch feed if we're on the posts tab
      if (activeTab === 'posts') {
        await refetchFeed();
      }
    } catch (error) {
      console.error('Error during refresh:', error);
    } finally {
      setRefreshing(false);
    }
  }, [refetchChannel, refetchFeed, activeTab]);

  // Handle end reached for pagination
  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Handle retry
  const handleRetry = useCallback(() => {
    refetchFeed();
  }, [refetchFeed]);

  // Handle position change for scroll tracking
  const handlePositionChange = useCallback((position: number) => {
    // Optional: Save scroll position for restoration
    // This can be used to restore the user's position when they return to the screen
  }, []);

  // Create tab options
  const tabOptions: TabOption[] = [
    { id: 'posts', label: 'posts' },
    { id: 'members', label: 'members' },
  ];



  if (channelError) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: channelColors.backgroundColor }]}>
        <EmptyFeed type="error" />
      </View>
    );
  }

  // Render header component
  const headerComponent = (
    <View style={styles.headerContainer}>
      <ChannelHeader
        channel={channelHeaderData}
        showBackButton={true}
        onBackPress={handleBackPress}
        onEdit={handleEdit}
        onDelete={handleDelete}
        mixIcon={
          channelData ? (() => {
            // Don't show mix controls for built-in feeds
            const isBuiltInFeed = ['following', 'yourMix'].includes(uri || '');
            if (isBuiltInFeed) return undefined;
            
            return {
              isInMix,
              isExcluded,
              onPress: () => {
                if (isExcluded) {
                  handleIncludeChannel();
                } else if (isInMix) {
                  handleRemoveFromMix();
                } else {
                  handleAddToMix();
                }
              }
            };
          })() : undefined
        }
      >
        {channelData && (
          <>
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
          </>
        )}
      </ChannelHeader>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: channelColors.backgroundColor }]}>
      {activeTab === 'posts' ? (
        <FeedFetcher
          feedOption={feedOption}
          userDid={undefined}
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
          isProfileLoading={isLoadingChannel && !channelData}
          isRefreshing={refreshing}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          isVisible={true}
          onPositionChange={handlePositionChange}
          initialPosition={undefined}
        />
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
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    minHeight: '100%', 
    backgroundColor: '#000',
    overflow: 'hidden'
  },
  headerContainer: {
    minHeight: 280,
  },
  errorContainer: {
    flex: 1, 
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    height: Dimensions.get('window').height,
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    fontFamily: 'Firma-Medium',
  },

});

export default ChannelScreen;
