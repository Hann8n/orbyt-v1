import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { NativePressable } from '@/components/ui/NativePressable';
import { SquircleView, SquircleNativePressable } from '@/components/ui/Squircle';
import { useRouter } from 'expo-router';
import { useProfileChannelNavigation } from '@/hooks/useProfileChannelNavigation';
import { buildChannelDetailHref } from '@/utils/navigation/detailRoutes';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import ListHeader from '@/components/ui/ListHeader';
import Icon, { PlusIcon, STROKE_WIDTH_THICK } from '@/components/ui/Icon';
import { Colors } from '@/theme';
import { Avatar } from '@/components/ui/UI';
import { useAlgorithmicFeedProvider } from '@/stores/userStore';
import { settingsLayoutStyles } from './SettingsStyles';
import { OptionsButton } from '@/components/ui/OptionsButton';
import { useSubscribedChannels } from '@/hooks/useSubscribedChannels';
import VerticalListSheet, {
  VerticalListButton,
  TrueSheet,
} from '@/components/ui/VerticalListSheet';
import { SHEET_STYLES, SHEET_VERTICAL_LIST_ROW_OUTER } from '@/utils/components/truesheet';
import {
  isOrbytChannel,
  getChannelByUri,
  getChannelAvatarUri,
  getLocalizedChannelDisplayName,
  getLocalizedChannelDescription,
  shouldShowChannelSlash,
} from '@/utils/channels/orbyt';
import { BORDER_RADIUS, ALGORITHMIC_FEED_PROVIDERS, LAYOUT_INSETS } from '@/utils/constants';
import { hexToRGBA, isColorDark } from '@/utils/formatting/colors';
import { AtprotoFeedService } from '@/services/api/feed/FeedService';
import { logger } from '@/utils/logger';
import { FontFamily, Typography } from '@/utils/components/typography';

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
  const { t } = useTranslation();
  const router = useRouter();
  const { hrefOpts } = useProfileChannelNavigation();
  const queryClient = useQueryClient();
  const { algorithmicFeedProvider, setAlgorithmicFeedProvider } = useAlgorithmicFeedProvider();
  const [pendingUri, setPendingUri] = useState<string | null | undefined>(undefined);
  const selectedUri = pendingUri !== undefined ? pendingUri : algorithmicFeedProvider;
  const {
    subscribedChannels: channels,
    subscribeToChannel,
    unsubscribeFromChannel,
  } = useSubscribedChannels();
  const [selectedChannel, setSelectedChannel] = useState<ChannelUser | null>(null);
  const [subscribingChannels, setSubscribingChannels] = useState<Set<string>>(new Set());

  const channelOptionsSheetTitle = useMemo(() => {
    if (!selectedChannel) return '';
    const name =
      getLocalizedChannelDisplayName(selectedChannel.uri ?? '', selectedChannel.displayName) ||
      selectedChannel.displayName ||
      selectedChannel.handle ||
      t('feed.unknownChannel');
    if (
      selectedChannel.isOrbytChannel &&
      selectedChannel.uri &&
      shouldShowChannelSlash(selectedChannel.uri)
    ) {
      return `/${name}`;
    }
    return name;
  }, [selectedChannel, t]);

  // Fetch feed generator metadata from API
  const { data: blueskyVideoData } = useQuery({
    queryKey: ['feedGenerator', ALGORITHMIC_FEED_PROVIDERS.BLUESKY_VIDEO.uri],
    queryFn: () =>
      AtprotoFeedService.getFeedGenerator(ALGORITHMIC_FEED_PROVIDERS.BLUESKY_VIDEO.uri),
    staleTime: 60 * 60 * 1000, // Cache for 1 hour
  });

  const { data: videosForYouData } = useQuery({
    queryKey: ['feedGenerator', ALGORITHMIC_FEED_PROVIDERS.VIDEOS_FOR_YOU.uri],
    queryFn: () =>
      AtprotoFeedService.getFeedGenerator(ALGORITHMIC_FEED_PROVIDERS.VIDEOS_FOR_YOU.uri),
    staleTime: 60 * 60 * 1000, // Cache for 1 hour
  });

  // Build feed options from API data
  const feedOptions = useMemo((): FeedProviderOption[] => {
    const options: FeedProviderOption[] = [];

    // Add Bluesky Video Feed
    options.push({
      id: 'bluesky-video',
      uri: ALGORITHMIC_FEED_PROVIDERS.BLUESKY_VIDEO.uri,
      displayName: blueskyVideoData?.view?.displayName || t('settings.blueskyVideoFeed'),
      description: blueskyVideoData?.view?.description || '',
    });

    // Add Videos For You
    options.push({
      id: 'videos-for-you',
      uri: ALGORITHMIC_FEED_PROVIDERS.VIDEOS_FOR_YOU.uri,
      displayName: videosForYouData?.view?.displayName || t('settings.videosForYou'),
      description: videosForYouData?.view?.description || '',
    });

    // Add None option
    options.push({
      id: 'none',
      uri: null,
      displayName: t('settings.none'),
      description: t('settings.onlySubscriptionsDescription'),
    });

    return options;
  }, [blueskyVideoData, videosForYouData, t]);

  const handleSelectProvider = async (uri: string | null) => {
    if (uri === selectedUri) return;

    setPendingUri(uri);
    setAlgorithmicFeedProvider(uri).then(() => {
      setPendingUri(undefined);
    }).catch(error => {
      logger.error('Error setting algorithmic feed provider', error, {
        component: 'AlgorithmicFeed',
      });
      setPendingUri(undefined);
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
    TrueSheet.present('algorithmic-feed-channel-options');
  }, []);

  const handleViewChannel = useCallback(() => {
    if (selectedChannel?.uri) {
      TrueSheet.dismiss('algorithmic-feed-channel-options');
      setSelectedChannel(null);
      router.dismissTo(buildChannelDetailHref(encodeURIComponent(selectedChannel.uri), hrefOpts));
    }
  }, [hrefOpts, router, selectedChannel]);

  const handleUnsubscribe = useCallback(async () => {
    if (!selectedChannel?.uri) return;

    Alert.alert(
      t('settings.unsubscribeChannel'),
      t('settings.unsubscribeConfirmWithName', {
        name:
          getLocalizedChannelDisplayName(selectedChannel.uri, selectedChannel.displayName) ||
          selectedChannel.displayName ||
          selectedChannel.handle ||
          t('feed.unknownChannel'),
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.unsubscribe'),
          onPress: async () => {
            try {
              await unsubscribeFromChannel(selectedChannel.uri!);
              TrueSheet.dismiss('algorithmic-feed-channel-options');
              setSelectedChannel(null);
            } catch (error) {
              logger.error('Error unsubscribing from channel', error, {
                component: 'AlgorithmicFeed',
              });
              Alert.alert(t('common.error'), t('settings.failedToUnsubscribe'));
            }
          },
        },
      ]
    );
  }, [selectedChannel, unsubscribeFromChannel, t]);

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
            displayName: channel.displayName || channel.handle || t('settings.untitledChannel'),
            description: channel.description,
            avatar: channel.avatar,
          });
        }
      } catch (error) {
        logger.error('Error toggling subscription', error, { component: 'AlgorithmicFeed' });
        Alert.alert(
          t('common.error'),
          isSubscribed ? t('settings.failedToUnsubscribeShort') : t('settings.failedToSubscribe')
        );
      } finally {
        setSubscribingChannels(prev => {
          const newSet = new Set(prev);
          newSet.delete(channel.uri!);
          return newSet;
        });
      }
    },
    [channels, subscribeToChannel, unsubscribeFromChannel, t]
  );

  const handleExplorePress = useCallback(() => {
    router.dismissTo('/(tabs)/explore');
  }, [router]);

  return (
    <View style={settingsLayoutStyles.container}>
      <ListHeader
        mode="sheet"
        title={t('settings.yourMix')}
        showCloseButton
        onClosePress={() => router.dismiss()}
        applySafeAreaTop={false}
        backgroundColor={Colors.transparent}
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={[
          settingsLayoutStyles.contentContainerWithPadding,
          { paddingHorizontal: LAYOUT_INSETS.SHEET_CONTENT },
        ]}
        showsVerticalScrollIndicator={true}
      >
        {/* Info Section */}
        <View style={styles.infoSection}>
          <Text style={styles.infoText}>{t('settings.algorithmicFeedInfo')}</Text>
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
                style={SHEET_VERTICAL_LIST_ROW_OUTER}
                rightIcon={
                  <SquircleView
                    style={[styles.optionCheckbox, selected && styles.optionCheckboxSelected]}
                  >
                    {selected && <Icon name="check" size={16} color={Colors.black} />}
                  </SquircleView>
                }
              />
            );
          })}
        </View>

        {/* Channels Section */}
        <View>
          <View style={styles.channelsSectionHeader}>
            <Text style={styles.channelsSectionTitle}>{t('settings.subscriptions')}</Text>
          </View>
          {listData.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Icon name="tv_2" size={48} color={Colors.neutral[200]} style={styles.emptyIcon} />
              <Text style={styles.emptyTitle}>{t('settings.noChannelsYet')}</Text>
              <Text style={styles.emptySubtitle}>{t('settings.exploreChannelsSubscribe')}</Text>
              <SquircleNativePressable style={styles.exploreButton} onPress={handleExplorePress}>
                <Text style={styles.exploreButtonText}>{t('settings.exploreChannels')}</Text>
              </SquircleNativePressable>
            </View>
          ) : (
            <View style={styles.channelsList}>
              {listData.map(channel => {
                const channelName =
                  getLocalizedChannelDisplayName(channel.uri ?? '', channel.displayName) ||
                  channel.displayName ||
                  channel.handle ||
                  t('feed.unknownChannel');
                const channelDesc =
                  getLocalizedChannelDescription(channel.uri ?? '', channel.description) ||
                  channel.description;
                const showSlash =
                  channel.isOrbytChannel && channel.uri && shouldShowChannelSlash(channel.uri);

                const isSubscribed = channels.some(ch => ch.uri === channel.uri);
                const isSubscribing = subscribingChannels.has(channel.uri || '');
                const channelColor = channel.channelColor || Colors.neutral[200];
                const useGlass = isLiquidGlassAvailable();
                const glassTint = isSubscribed
                  ? hexToRGBA(channelColor, 1)
                  : hexToRGBA(Colors.neutral[50], 0.08);
                const subscribedTextColor = isSubscribed
                  ? isColorDark(channelColor)
                    ? Colors.neutral[50]
                    : Colors.black
                  : Colors.neutral[50];

                return (
                  <NativePressable
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
                      fallbackIconColor={Colors.neutral[200]}
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
                      {channelDesc && (
                        <Text style={styles.channelDescription} numberOfLines={1}>
                          {channelDesc}
                        </Text>
                      )}
                    </View>
                    <SquircleNativePressable
                      style={[
                        styles.subscribeButton,
                        useGlass
                          ? styles.subscribeButtonGlass
                          : [
                              styles.subscribeButtonBase,
                              isSubscribed
                                ? { backgroundColor: channelColor }
                                : styles.subscribeButtonUnsub,
                            ],
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
                      <View pointerEvents="none" style={styles.subscribeButtonInner}>
                        {isSubscribing ? (
                          <ActivityIndicator
                            size="small"
                            color={isSubscribed ? subscribedTextColor : Colors.neutral[50]}
                          />
                        ) : (
                          <>
                            <Text
                              style={[
                                styles.subscribeButtonText,
                                { color: isSubscribed ? subscribedTextColor : Colors.neutral[50] },
                              ]}
                            >
                              {isSubscribed ? t('settings.subscribed') : t('settings.subscribe')}
                            </Text>
                            {!isSubscribed && (
                              <PlusIcon
                                size={10}
                                color={Colors.neutral[50]}
                                strokeWidth={STROKE_WIDTH_THICK}
                              />
                            )}
                          </>
                        )}
                      </View>
                    </SquircleNativePressable>
                  </NativePressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <VerticalListSheet
        name="algorithmic-feed-channel-options"
        onDismiss={() => setSelectedChannel(null)}
      >
        <View style={styles.sheetContent}>
          {channelOptionsSheetTitle ? (
            <Text style={SHEET_STYLES.sheetScreenTitle} numberOfLines={2}>
              {channelOptionsSheetTitle}
            </Text>
          ) : null}
          {selectedChannel && (
            <VerticalListButton label={t('common.view')} onPress={handleViewChannel} />
          )}
          <VerticalListButton label={t('common.unsubscribe')} onPress={handleUnsubscribe} />
        </View>
      </VerticalListSheet>
    </View>
  );
};

const styles = StyleSheet.create({
  optionCheckbox: {
    width: 22,
    height: 22,
    borderRadius: BORDER_RADIUS.SMALL,
    borderWidth: 2,
    borderColor: Colors.neutral[200],
    backgroundColor: Colors.transparent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionCheckboxSelected: {
    borderColor: Colors.neutral[50],
    backgroundColor: Colors.neutral[50],
  },
  content: {
    flex: 1,
  },
  infoSection: {
    paddingHorizontal: 0,
    paddingTop: 8,
    paddingBottom: 16,
  },
  infoText: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.bodySmall,
    fontFamily: FontFamily.regular,
    lineHeight: Typography.lineHeights.bodySmall,
  },
  channelsSectionHeader: {
    paddingHorizontal: 0,
    paddingTop: 15,
    paddingBottom: 8,
  },
  channelsSectionTitle: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.title,
    fontFamily: FontFamily.bold,
  },
  channelsList: {
    marginTop: 0,
  },
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 0,
    backgroundColor: Colors.transparent,
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
    color: Colors.neutral[50],
    fontSize: Typography.sizes.bodySmall,
    fontFamily: FontFamily.bold,
    marginBottom: 2,
  },
  orbytSlash: {
    fontSize: Typography.sizes.bodySmall,
    marginBottom: 2,
    fontFamily: FontFamily.bold,
    marginRight: 0,
  },
  channelDescription: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.bodySmall,
    fontFamily: FontFamily.regular,
  },
  subscribeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    gap: 4,
    overflow: 'hidden',
  },
  subscribeButtonBase: {
    borderColor: Colors.transparent,
    borderWidth: 0,
  },
  subscribeButtonGlass: {
    backgroundColor: Colors.transparent,
    borderColor: Colors.transparent,
    borderWidth: 0,
  },
  subscribeButtonUnsub: {
    backgroundColor: Colors.overlay.white30,
  },
  subscribeButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  glassBackgroundFull: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
  },
  subscribeButtonText: {
    fontFamily: FontFamily.semibold,
    fontSize: Typography.sizes.caption,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 0,
  },
  emptyIcon: {
    marginBottom: 16,
    opacity: 0.8,
  },
  emptyTitle: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.h3,
    fontFamily: FontFamily.bold,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.subtitle,
    fontFamily: FontFamily.medium,
    textAlign: 'center',
    lineHeight: Typography.lineHeights.subtitle,
    marginBottom: 24,
  },
  exploreButton: {
    backgroundColor: Colors.neutral[50],
    borderRadius: BORDER_RADIUS.FULL,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderWidth: 0,
    borderColor: Colors.transparent,
  },
  exploreButtonText: {
    color: Colors.black,
    fontSize: Typography.sizes.subtitle,
    fontFamily: FontFamily.semibold,
  },
  sheetContent: {
    paddingBottom: 12,
  },
});

export default AlgorithmicFeedScreen;
