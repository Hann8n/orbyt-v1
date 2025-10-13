import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { BORDER_RADIUS } from '../../src/utils/constants';
import {
  View,
  StyleSheet,
  RefreshControl,
  Dimensions,
  TouchableOpacity,
  Text,
} from 'react-native';
// Use plain FlashList via FeedRenderer; no adapter/converter
import { useRouter, useLocalSearchParams } from 'expo-router';

import ChannelHeader from '../../src/components/layout/header/ChannelHeader';
import FeedRenderer from '../../src/components/features/feed/FeedRenderer';
import { Colors } from '../../src/components/ui/UI';

import { useChannelColors, useChannel, useChannelColorsMutation, default as ChannelCache } from '../../src/services/cache/ChannelCache';
import ProfileCache from '../../src/services/cache/ProfileCache';
import { extractColorsFromImage } from '../../src/utils/formatting/colorUtils';
import Icon from '../../src/components/ui/Icon';

interface ChannelScreenProps {}

const Channel: React.FC<ChannelScreenProps> = memo(() => {
  const navigation = useRouter();
  const params = useLocalSearchParams();

  // Get the channel URI from the route parameters (decode for safety)
  const uriParam = (params.id as string) || '';
  const uri = uriParam ? decodeURIComponent(uriParam) : '';
  
  const [refreshing, setRefreshing] = useState(false);

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
      const invalidateAndRefetch = async () => {
        try {
          await ChannelCache.invalidateChannel(uri);
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

  // View mode state
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'horizontal'>('list');

  // Use feed query for channel posts
  const feedOption = uri || '';
  const channelDataForFeed = channelData;

  // Memoized query options - always enabled for channel posts
  const queryOptions = useMemo(() => ({ 
    enabled: !!feedOption && feedOption.startsWith('at://') && !!channelDataForFeed?.did
  }), [feedOption, channelDataForFeed?.did]);

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
      console.error('Error extracting/saving channel colors:', error);
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
      ProfileCache.getProfile(channelData.creator.handle).catch(error => {
        console.warn('Error preloading channel creator profile:', error);
      });
    }
  }, [channelData?.creator?.handle]);

  // Force refresh channel data to get subscriber count if not available
  useEffect(() => {
    if (uri && channelData && !channelData.subscriberCount) {
      const forceRefresh = async () => {
        try {
          await ChannelCache.forceRefreshChannel(uri);
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
      name: channelData.displayName || 'Untitled Channel',
      description: channelData.description || '',
      avatar: channelData.avatar || '',
      likeCount,
      isOwner: false,
      isExperimental: channelData.isExperimental,
      creator: channelData.creator || null,
    };
  }, [channelData, uri]);

  // Handle back press
  const handleBackPress = useCallback(() => {
    navigation.back();
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

  // Handle position change for scroll tracking
  const handlePositionChange = useCallback((position: number) => {
  }, []);


  const showErrorScreen = !!channelError && !refreshing;

  const renderErrorScreen = () => (
    <View style={[styles.errorContainer, { backgroundColor: channelColors.backgroundColor || '#000' }]}> 
      <Icon name="user-x" size={48} color={channelColors.textColor || '#fff'} style={styles.errorIcon} />
      <Text style={[styles.errorText, { color: channelColors.textColor || '#fff' }]}>Channel Not Found</Text>
      <Text style={styles.errorSubtext}>
        {"We couldn't retrieve this channel information"}
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
        onPress={() => navigation.back()}
      >
        <Text style={[styles.errorButtonText, { color: channelColors.textColor || '#fff' }]}>Go Back</Text>
      </TouchableOpacity>
    </View>
  );

  const headerComponent = (
    <View style={styles.headerContainer} pointerEvents="box-none">
      <ChannelHeader
        channel={channelHeaderData}
        showBackButton={true}
        onBackPress={handleBackPress}
        applySafeArea={true}
      />
    </View>
  );

  return (
    <View style={[
      styles.container, 
      { 
        backgroundColor: Colors.black, 
      }
    ]}>
      {showErrorScreen ? (
        renderErrorScreen()
      ) : (
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
            backgroundColor={Colors.black}
            secondaryColor={channelColors.textColor}
            isProfileLoading={isLoadingChannel && !channelDataForFeed}
            isRefreshing={refreshing}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onPositionChange={handlePositionChange}
            initialPosition={undefined}
            queryOptions={queryOptions}
            isVisible={true}
          />
        ) : (
          <FeedRenderer
            feedOption=""
            userDid={undefined}
            headerComponent={headerComponent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={channelColors.textColor}
              />
            }
            backgroundColor={Colors.black}
            secondaryColor={channelColors.textColor}
            isProfileLoading={isLoadingChannel && !channelDataForFeed}
            isRefreshing={refreshing}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onPositionChange={handlePositionChange}
            initialPosition={undefined}
            queryOptions={{ enabled: false }}
            isVisible={true}
          />
        )
      )}
    </View>
  );
});

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
    borderRadius: BORDER_RADIUS.MEDIUM,
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

export default Channel;


