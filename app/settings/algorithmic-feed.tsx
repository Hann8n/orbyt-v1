import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import ListHeader from '../../src/components/ui/ListHeader';
import Icon, { Loading3FillIcon, PlusIcon } from '../../src/components/ui/Icon';
import { Colors, Avatar } from '../../src/components/ui/UI';
import { useAlgorithmicFeedProvider, ALGORITHMIC_FEED_PROVIDERS } from '../../src/stores/userStore';
import { settingsButtonStyles, settingsTextStyles, settingsLayoutStyles } from './SettingsStyles';
import { OptionsButton } from '../../src/components/ui/OptionsButton';
import { useSubscribedChannels } from '../../src/hooks/useSubscribedChannels';
import VerticalListSheet, { VerticalListButton } from '../../src/components/ui/VerticalListSheet';
import { isOrbytChannel, getChannelByUri, getChannelAvatarUri, shouldShowChannelSlash } from '../../src/utils/orbytChannels';
import { BORDER_RADIUS } from '../../src/utils/constants';
import { hexToRGBA, isColorDark } from '../../src/utils/formatting/colorUtils';

interface FeedProviderOption {
  id: string;
  uri: string | null;
  displayName: string;
  description: string;
}

interface ChannelUser {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  description?: string;
  isChannel?: boolean;
  isOrbytChannel?: boolean;
  channelColor?: string;
  uri?: string;
}

const FEED_OPTIONS: FeedProviderOption[] = [
  {
    id: 'bluesky-video',
    uri: ALGORITHMIC_FEED_PROVIDERS.BLUESKY_VIDEO.uri,
    displayName: ALGORITHMIC_FEED_PROVIDERS.BLUESKY_VIDEO.displayName,
    description: ALGORITHMIC_FEED_PROVIDERS.BLUESKY_VIDEO.description,
  },
  {
    id: 'videos-for-you',
    uri: ALGORITHMIC_FEED_PROVIDERS.VIDEOS_FOR_YOU.uri,
    displayName: ALGORITHMIC_FEED_PROVIDERS.VIDEOS_FOR_YOU.displayName,
    description: ALGORITHMIC_FEED_PROVIDERS.VIDEOS_FOR_YOU.description,
  },
  {
    id: 'none',
    uri: null,
    displayName: 'None',
    description: 'Only show content from your subscriptions',
  },
];

const AlgorithmicFeedScreen: React.FC = () => {
  const navigation = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { algorithmicFeedProvider, setAlgorithmicFeedProvider } = useAlgorithmicFeedProvider();
  const [selectedUri, setSelectedUri] = useState<string | null>(algorithmicFeedProvider);
  const [isSaving, setIsSaving] = useState(false);
  const {
    subscribedChannels: channels,
    subscribeToChannel,
    unsubscribeFromChannel,
  } = useSubscribedChannels();
  const [selectedChannel, setSelectedChannel] = useState<ChannelUser | null>(null);
  const [isSheetVisible, setIsSheetVisible] = useState(false);
  const [displayedTitle, setDisplayedTitle] = useState<string>('');
  const [subscribingChannels, setSubscribingChannels] = useState<Set<string>>(new Set());

  // Sync with store when it changes
  useEffect(() => {
    setSelectedUri(algorithmicFeedProvider);
  }, [algorithmicFeedProvider]);

  const handleSelectProvider = async (uri: string | null) => {
    if (uri === selectedUri) return;
    
    setIsSaving(true);
    setSelectedUri(uri);
    
    try {
      await setAlgorithmicFeedProvider(uri);
      // Invalidate feed queries to refresh with new provider
      queryClient.invalidateQueries({ queryKey: ['feed', 'your-mix'] });
    } catch (error) {
      console.error('Error setting algorithmic feed provider:', error);
      // Revert on error
      setSelectedUri(algorithmicFeedProvider);
    } finally {
      setIsSaving(false);
    }
  };

  const isSelected = (uri: string | null) => {
    if (uri === null && selectedUri === null) return true;
    return uri === selectedUri;
  };

  // Transform channels data - subscribed channels only (no built-ins)
  const listData = useMemo((): ChannelUser[] => {
    // Filter out built-in channels as a safety measure
    const BUILT_IN_CHANNELS = ['following', 'your-mix'];
    const filteredChannels = channels.filter(ch => !BUILT_IN_CHANNELS.includes(ch.uri));
    
    return filteredChannels.map((channel) => {
      const avatar = getChannelAvatarUri(channel.uri, channel.avatar);
      
      // Check if this is an Orbyt channel
      const isOrbyt = channel.isOrbytChannel ?? isOrbytChannel(channel.uri);
      const orbytChannel = isOrbyt ? getChannelByUri(channel.uri) : undefined;
      
      return {
        did: channel.uri,
        handle: channel.uri.split('/').pop() || '',
        displayName: channel.displayName,
        avatar: avatar,
        description: channel.description,
        isChannel: true,
        isOrbytChannel: isOrbyt,
        channelColor: orbytChannel?.channelColor,
        uri: channel.uri,
      };
    });
  }, [channels]);

  const handleChannelPress = useCallback((channel: ChannelUser) => {
    setSelectedChannel(channel);
    setIsSheetVisible(true);
    // Set the displayed title immediately
    if (channel.isOrbytChannel && channel.uri && shouldShowChannelSlash(channel.uri)) {
      setDisplayedTitle(`/${channel.displayName || channel.handle || 'Unknown channel'}`);
    } else {
      setDisplayedTitle(channel.displayName || channel.handle || 'Unknown channel');
    }
  }, []);

  const handleViewChannel = useCallback(() => {
    if (selectedChannel?.uri) {
      const encodedUri = encodeURIComponent(selectedChannel.uri);
      setIsSheetVisible(false);
      setSelectedChannel(null);
      navigation.push(`/channel/${encodedUri}`);
    }
  }, [selectedChannel, navigation]);

  const handleUnsubscribe = useCallback(async () => {
    if (!selectedChannel?.uri) return;
    
    Alert.alert(
      'Unsubscribe from Channel',
      `Are you sure you want to unsubscribe from "${selectedChannel.displayName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unsubscribe',
          onPress: async () => {
            try {
              await unsubscribeFromChannel(selectedChannel.uri!);
              setIsSheetVisible(false);
              setSelectedChannel(null);
            } catch (error) {
              console.error('Error unsubscribing from channel:', error);
              Alert.alert('Error', 'Failed to unsubscribe from channel. Please try again.');
            }
          }
        }
      ]
    );
  }, [selectedChannel, unsubscribeFromChannel]);

  const handleSubscribeToggle = useCallback(async (channel: ChannelUser) => {
    if (!channel.uri) return;
    
    const isSubscribed = channels.some(ch => ch.uri === channel.uri);
    
    try {
      setSubscribingChannels(prev => new Set(prev).add(channel.uri!));
      
      if (isSubscribed) {
        await unsubscribeFromChannel(channel.uri);
      } else {
        await subscribeToChannel({
          uri: channel.uri,
          displayName: channel.displayName,
          description: channel.description,
          avatar: channel.avatar,
        });
      }
    } catch (error) {
      console.error('Error toggling subscription:', error);
      Alert.alert('Error', `Failed to ${isSubscribed ? 'unsubscribe from' : 'subscribe to'} channel. Please try again.`);
    } finally {
      setSubscribingChannels(prev => {
        const newSet = new Set(prev);
        newSet.delete(channel.uri!);
        return newSet;
      });
    }
  }, [channels, subscribeToChannel, unsubscribeFromChannel]);

  const handleExplorePress = useCallback(() => {
    navigation.back();
    setTimeout(() => {
      navigation.push('/explore');
    }, 100);
  }, [navigation]);

  return (
    <View style={settingsLayoutStyles.container}>
      <ListHeader
        mode="sheet"
        title="Your mix"
        showCloseButton
        onClosePress={() => navigation.back()}
        applySafeAreaTop={false}
        style={{ marginHorizontal: -5 }}
      />

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={settingsLayoutStyles.contentContainerWithPadding}
        showsVerticalScrollIndicator={false}
      >
        {/* Info Section */}
        <View style={styles.infoSection}>
          <Text style={styles.infoText}>
            Choose a personalized feed to blend recommendations into your mix.
          </Text>
        </View>

        {/* Feed Provider Options */}
        <View style={settingsLayoutStyles.section}>
          {FEED_OPTIONS.map((option) => {
            const selected = isSelected(option.uri);
            return (
              <OptionsButton
                key={option.id}
                label={option.displayName}
                description={option.description}
                onPress={() => handleSelectProvider(option.uri)}
                disabled={isSaving}
                selected={selected}
                loading={isSaving && selected}
                rightIcon={isSaving && selected ? (
                  <Loading3FillIcon size={24} color={Colors.lightGreen} />
                ) : selected ? (
                  <Icon name="check" size={24} color={Colors.lightGreen} />
                ) : undefined}
              />
            );
          })}
        </View>

        {/* Channels Section */}
        <View>
          <View style={styles.channelsSectionHeader}>
            <Text style={styles.channelsSectionTitle}>Subscriptions</Text>
          </View>
          {listData.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Icon name="tv" size={48} color={Colors.lightGray} style={styles.emptyIcon} />
              <Text style={styles.emptyTitle}>No channels yet</Text>
              <Text style={styles.emptySubtitle}>Explore channels to subscribe to them</Text>
              <Pressable
                style={styles.exploreButton}
                onPress={handleExplorePress}
              >
                <Text style={styles.exploreButtonText}>Explore Channels</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.channelsList}>
              {listData.map((channel) => {
                const channelName = channel.displayName || channel.handle || 'Unknown channel';
                const showSlash = channel.isOrbytChannel && channel.uri && shouldShowChannelSlash(channel.uri);
                
                const isSubscribed = channels.some(ch => ch.uri === channel.uri);
                const isSubscribing = subscribingChannels.has(channel.uri || '');
                const channelColor = channel.channelColor || Colors.lightGray;
                const useGlass = isLiquidGlassAvailable();
                const glassTint = isSubscribed ? hexToRGBA(channelColor, 1) : hexToRGBA('#FFFFFF', 0.08);
                const subscribedTextColor = isSubscribed 
                  ? (isColorDark(channelColor) ? '#FFFFFF' : '#000000')
                  : '#FFFFFF';
                
                return (
                  <Pressable
                    key={channel.uri || channel.did}
                    style={styles.channelItem}
                    onPress={() => handleChannelPress(channel)}
                  >
                    <Avatar 
                      uri={channel.avatar} 
                      type="channel" 
                      size={50} 
                      ringColor="transparent" 
                      style={styles.channelAvatar}
                      fallbackIcon="tv"
                      fallbackIconSize={28}
                      fallbackIconColor={Colors.lightGray}
                    />
                    <View style={styles.channelContent}>
                      <View style={styles.channelNameRow}>
                        {showSlash && (
                          <Text style={[styles.channelLabel, styles.orbytSlash, { color: channelColor }]}>
                            /
                          </Text>
                        )}
                        <Text style={styles.channelLabel} numberOfLines={1}>
                          {channelName}
                        </Text>
                      </View>
                      {channel.description && (
                        <Text style={styles.channelDescription} numberOfLines={1}>
                          {channel.description}
                        </Text>
                      )}
                    </View>
                    <Pressable
                      style={[
                        styles.subscribeButton,
                        useGlass
                          ? { backgroundColor: 'transparent', borderColor: 'transparent', borderWidth: 0 }
                          : {
                              backgroundColor: isSubscribed ? channelColor : 'rgba(255, 255, 255, 0.2)',
                              borderColor: 'transparent',
                              borderWidth: 0,
                            }
                      ]}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleSubscribeToggle(channel);
                      }}
                      disabled={isSubscribing}
                    >
                      {useGlass && (
                        <GlassView
                          style={styles.glassBackgroundFull}
                          glassEffectStyle="clear"
                          tintColor={glassTint}
                          isInteractive
                        />
                      )}
                      <View pointerEvents="none" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        {isSubscribing ? (
                          <Loading3FillIcon 
                            size={14} 
                            color={isSubscribed ? subscribedTextColor : '#FFFFFF'} 
                          />
                        ) : (
                          <>
                            <Text style={[
                              styles.subscribeButtonText,
                              { color: isSubscribed ? subscribedTextColor : '#FFFFFF' }
                            ]}>
                              {isSubscribed ? 'Subscribed' : 'Subscribe'}
                            </Text>
                            {!isSubscribed && (
                              <PlusIcon 
                                size={10} 
                                color="#FFFFFF" 
                                strokeWidth={2.0}
                              />
                            )}
                          </>
                        )}
                      </View>
                    </Pressable>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <VerticalListSheet
        visible={isSheetVisible}
        onDismiss={() => {
          setIsSheetVisible(false);
          setSelectedChannel(null);
        }}
        title={displayedTitle || 'Channel Options'}
        showCancelButton={true}
      >
        <View style={styles.sheetContent}>
          {selectedChannel && (
            <VerticalListButton
              label="View"
              onPress={handleViewChannel}
            />
          )}
          <VerticalListButton
            label="Unsubscribe"
            onPress={handleUnsubscribe}
          />
        </View>
      </VerticalListSheet>
    </View>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  infoSection: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  infoText: {
    color: Colors.gray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    lineHeight: 20,
  },
  footerSection: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
  },
  footerText: {
    color: Colors.gray,
    fontSize: 13,
    fontFamily: 'Firma-Regular',
    lineHeight: 18,
    fontStyle: 'italic',
  },
  channelsSectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 8,
  },
  channelsSectionTitle: {
    color: Colors.white,
    fontSize: 18,
    fontFamily: 'Firma-SemiBold',
  },
  channelsList: {
    marginTop: 0,
  },
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
  },
  channelAvatar: {
    marginRight: 12,
  },
  channelContent: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  channelNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  channelLabel: {
    color: Colors.white,
    fontSize: 14,
    fontFamily: 'Firma-SemiBold',
    marginBottom: 2,
  },
  orbytSlash: {
    fontSize: 14,
    marginBottom: 2,
    fontFamily: 'Firma-SemiBold',
    marginRight: 0,
  },
  channelDescription: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
  },
  subscribeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    gap: 4,
    overflow: 'hidden',
  },
  glassBackgroundFull: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
  },
  subscribeButtonText: {
    fontFamily: 'Firma-SemiBold',
    fontSize: 12,
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    marginBottom: 16,
    opacity: 0.8,
  },
  emptyTitle: {
    color: Colors.white,
    fontSize: 20,
    fontFamily: 'Firma-Bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Firma-Medium',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  exploreButton: {
    backgroundColor: Colors.white,
    borderRadius: BORDER_RADIUS.FULL,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  exploreButtonText: {
    color: '#000000',
    fontSize: 16,
    fontFamily: 'Firma-SemiBold',
  },
  sheetContent: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
});

export default AlgorithmicFeedScreen;
