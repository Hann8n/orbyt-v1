import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import ListHeader from '../../src/components/ui/ListHeader';
import Icon, { Loading3FillIcon, PlusIcon } from '../../src/components/ui/Icon';
import { Colors, Avatar } from '../../src/components/ui/UI';
import { useAlgorithmicFeedProvider } from '../../src/stores/userStore';
import { settingsLayoutStyles } from './SettingsStyles';
import { OptionsButton } from '../../src/components/ui/OptionsButton';
import { useSubscribedChannels } from '../../src/hooks/useSubscribedChannels';
import VerticalListSheet, { VerticalListButton } from '../../src/components/ui/VerticalListSheet';
import {
  isOrbytChannel,
  getChannelByUri,
  getChannelAvatarUri,
  shouldShowChannelSlash,
} from '../../src/utils/channels/orbyt';
import { BORDER_RADIUS, ALGORITHMIC_FEED_PROVIDERS } from '../../src/utils/constants';
import { hexToRGBA, isColorDark } from '../../src/utils/formatting/colors';
import { AtprotoService } from '../../src/services/api/AtprotoService';

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

const AlgorithmicFeedScreen: React.FC = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { algorithmicFeedProvider, setAlgorithmicFeedProvider } = useAlgorithmicFeedProvider();
  const [selectedUri, setSelectedUri] = useState<string | null>(algorithmicFeedProvider);
  const {
    subscribedChannels: channels,
    subscribeToChannel,
    unsubscribeFromChannel,
  } = useSubscribedChannels();
  const [selectedChannel, setSelectedChannel] = useState<ChannelUser | null>(null);
  const [isSheetVisible, setIsSheetVisible] = useState(false);
  const [displayedTitle, setDisplayedTitle] = useState<string>('');
  const [subscribingChannels, setSubscribingChannels] = useState<Set<string>>(new Set());

  // Fetch feed generator metadata from API
  const { data: blueskyVideoData } = useQuery({
    queryKey: ['feedGenerator', ALGORITHMIC_FEED_PROVIDERS.BLUESKY_VIDEO.uri],
    queryFn: () => AtprotoService.getFeedGenerator(ALGORITHMIC_FEED_PROVIDERS.BLUESKY_VIDEO.uri),
    staleTime: 60 * 60 * 1000, // Cache for 1 hour
  });

  const { data: videosForYouData } = useQuery({
    queryKey: ['feedGenerator', ALGORITHMIC_FEED_PROVIDERS.VIDEOS_FOR_YOU.uri],
    queryFn: () => AtprotoService.getFeedGenerator(ALGORITHMIC_FEED_PROVIDERS.VIDEOS_FOR_YOU.uri),
    staleTime: 60 * 60 * 1000, // Cache for 1 hour
  });

  // Build feed options from API data
  const feedOptions = useMemo((): FeedProviderOption[] => {
    const options: FeedProviderOption[] = [];

    // Add Bluesky Video Feed
    options.push({
      id: 'bluesky-video',
      uri: ALGORITHMIC_FEED_PROVIDERS.BLUESKY_VIDEO.uri,
      displayName: blueskyVideoData?.view?.displayName || 'Bluesky Video Feed',
      description: blueskyVideoData?.view?.description || '',
    });

    // Add Videos For You
    options.push({
      id: 'videos-for-you',
      uri: ALGORITHMIC_FEED_PROVIDERS.VIDEOS_FOR_YOU.uri,
      displayName: videosForYouData?.view?.displayName || 'Videos For You',
      description: videosForYouData?.view?.description || '',
    });

    // Add None option
    options.push({
      id: 'none',
      uri: null,
      displayName: 'None',
      description: 'Only show content from your subscriptions',
    });

    return options;
  }, [blueskyVideoData, videosForYouData]);

  // Sync with store when it changes
  useEffect(() => {
    setSelectedUri(algorithmicFeedProvider);
  }, [algorithmicFeedProvider]);

  const handleSelectProvider = async (uri: string | null) => {
    if (uri === selectedUri) return;

    // Optimistic update - update UI immediately
    setSelectedUri(uri);

    // Save in background
    setAlgorithmicFeedProvider(uri).catch(error => {
      console.error('Error setting algorithmic feed provider:', error);
      // Revert on error
      setSelectedUri(algorithmicFeedProvider);
    });

    // Invalidate feed queries to refresh with new provider
    queryClient.invalidateQueries({ queryKey: ['feed', 'your-mix'] });
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

    return filteredChannels.map(channel => {
      const avatar = getChannelAvatarUri(channel.uri, channel.avatar);

      // Check if this is an orbyt channel
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
      setIsSheetVisible(false);
      setSelectedChannel(null);
      // Use replace to ensure channel opens as fullscreen modal
      router.replace({
        pathname: '/channel/[id]',
        params: { id: selectedChannel.uri },
      });
    }
  }, [selectedChannel, router]);

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
          },
        },
      ]
    );
  }, [selectedChannel, unsubscribeFromChannel]);

  const handleSubscribeToggle = useCallback(
    async (channel: ChannelUser) => {
      if (!channel.uri) return;

      const isSubscribed = channels.some(ch => ch.uri === channel.uri);

      try {
        setSubscribingChannels(prev => new Set(prev).add(channel.uri!));

        if (isSubscribed) {
          await unsubscribeFromChannel(channel.uri);
        } else {
          await subscribeToChannel({
            uri: channel.uri,
            displayName: channel.displayName || channel.handle || 'Untitled Channel',
            description: channel.description,
            avatar: channel.avatar,
          });
        }
      } catch (error) {
        console.error('Error toggling subscription:', error);
        Alert.alert(
          'Error',
          `Failed to ${isSubscribed ? 'unsubscribe from' : 'subscribe to'} channel. Please try again.`
        );
      } finally {
        setSubscribingChannels(prev => {
          const newSet = new Set(prev);
          newSet.delete(channel.uri!);
          return newSet;
        });
      }
    },
    [channels, subscribeToChannel, unsubscribeFromChannel]
  );

  const handleExplorePress = useCallback(() => {
    router.back();
    setTimeout(() => {
      router.push('/(tabs)/explore');
    }, 100);
  }, [router]);

  return (
    <View style={settingsLayoutStyles.container}>
      <ListHeader
        mode="sheet"
        title="Your mix"
        showCloseButton
        onClosePress={() => router.back()}
        applySafeAreaTop={false}
        backgroundColor={Colors.black}
        titleIndent={true}
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
          {feedOptions.map(option => {
            const selected = isSelected(option.uri);
            return (
              <OptionsButton
                key={option.id}
                label={option.displayName}
                description={option.description}
                onPress={() => handleSelectProvider(option.uri)}
                rightIcon={
                  <View
                    style={[
                      {
                        width: 22,
                        height: 22,
                        borderRadius: BORDER_RADIUS.SMALL,
                        borderWidth: 2,
                        borderColor: selected ? Colors.white : Colors.lightGray,
                        backgroundColor: selected ? Colors.white : 'transparent',
                        justifyContent: 'center',
                        alignItems: 'center',
                      },
                    ]}
                  >
                    {selected && <Icon name="checkmark" size={16} color={Colors.black} />}
                  </View>
                }
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
              <Pressable style={styles.exploreButton} onPress={handleExplorePress}>
                <Text style={styles.exploreButtonText}>Explore Channels</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.channelsList}>
              {listData.map(channel => {
                const channelName = channel.displayName || channel.handle || 'Unknown channel';
                const showSlash =
                  channel.isOrbytChannel && channel.uri && shouldShowChannelSlash(channel.uri);

                const isSubscribed = channels.some(ch => ch.uri === channel.uri);
                const isSubscribing = subscribingChannels.has(channel.uri || '');
                const channelColor = channel.channelColor || Colors.lightGray;
                const useGlass = isLiquidGlassAvailable();
                const glassTint = isSubscribed
                  ? hexToRGBA(channelColor, 1)
                  : hexToRGBA('#FFFFFF', 0.08);
                const subscribedTextColor = isSubscribed
                  ? isColorDark(channelColor)
                    ? '#FFFFFF'
                    : '#000000'
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
                          <Text
                            style={[
                              styles.channelLabel,
                              styles.orbytSlash,
                              { color: channelColor },
                            ]}
                          >
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
                          ? {
                              backgroundColor: 'transparent',
                              borderColor: 'transparent',
                              borderWidth: 0,
                            }
                          : {
                              backgroundColor: isSubscribed
                                ? channelColor
                                : 'rgba(255, 255, 255, 0.2)',
                              borderColor: 'transparent',
                              borderWidth: 0,
                            },
                      ]}
                      onPress={e => {
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
                      <View
                        pointerEvents="none"
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                        }}
                      >
                        {isSubscribing ? (
                          <Loading3FillIcon
                            size={14}
                            color={isSubscribed ? subscribedTextColor : '#FFFFFF'}
                          />
                        ) : (
                          <>
                            <Text
                              style={[
                                styles.subscribeButtonText,
                                { color: isSubscribed ? subscribedTextColor : '#FFFFFF' },
                              ]}
                            >
                              {isSubscribed ? 'Subscribed' : 'Subscribe'}
                            </Text>
                            {!isSubscribed && (
                              <PlusIcon size={10} color="#FFFFFF" strokeWidth={2.0} />
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
          {selectedChannel && <VerticalListButton label="View" onPress={handleViewChannel} />}
          <VerticalListButton label="Unsubscribe" onPress={handleUnsubscribe} />
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
    fontFamily: 'Figtree-Regular',
    lineHeight: 20,
  },
  channelsSectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 8,
  },
  channelsSectionTitle: {
    color: Colors.white,
    fontSize: 18,
    fontFamily: 'Figtree-Bold',
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
    fontFamily: 'Figtree-Bold',
    marginBottom: 2,
  },
  orbytSlash: {
    fontSize: 14,
    marginBottom: 2,
    fontFamily: 'Figtree-Bold',
    marginRight: 0,
  },
  channelDescription: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Figtree-Regular',
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
    fontFamily: 'Figtree-SemiBold',
    fontSize: 12,
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
    fontFamily: 'Figtree-Bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Figtree-Medium',
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
    fontFamily: 'Figtree-SemiBold',
  },
  sheetContent: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
});

export default AlgorithmicFeedScreen;
