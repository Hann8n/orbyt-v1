import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View, Text, StyleSheet, FlatList } from 'react-native';
import { SquircleNativePressable } from '@/components/ui/Squircle';
import { useRouter } from 'expo-router';
import { useProfileChannelNavigation } from '@/hooks/useProfileChannelNavigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSubscribedChannels } from '@/hooks/useSubscribedChannels';
import { Colors } from '@/theme';
import { Avatar, Icon } from '@/components/ui/UI';
import { BORDER_RADIUS, SCROLL_INDICATOR_CONSTANTS } from '@/utils/constants';
import ListHeader from '@/components/ui/ListHeader';
import VerticalListSheet, {
  VerticalListButton,
  TrueSheet,
} from '@/components/ui/VerticalListSheet';
import { SHEET_STYLES, voidTrueSheet } from '@/utils/components/truesheet';
import {
  isOrbytChannel,
  getChannelByUri,
  getChannelAvatarUri,
  getLocalizedChannelDisplayName,
  shouldShowChannelSlash,
} from '@/utils/channels/orbyt';
import { logger } from '@/utils/logger';
import { FontFamily, Typography } from '@/utils/components/typography';

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

export default function ChannelManagementScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { navigateToChannel: goToChannel } = useProfileChannelNavigation();
  const insets = useSafeAreaInsets();

  const { subscribedChannels: channels, unsubscribeFromChannel } = useSubscribedChannels();

  const [selectedChannel, setSelectedChannel] = useState<ChannelUser | null>(null);

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
    voidTrueSheet(
      'present',
      'settings-channels-sheet',
      TrueSheet.present('settings-channels-sheet')
    );
  }, []);

  const handleViewChannel = useCallback(() => {
    if (selectedChannel?.uri) {
      voidTrueSheet(
        'dismiss',
        'settings-channels-sheet',
        TrueSheet.dismiss('settings-channels-sheet')
      );
      setSelectedChannel(null);
      goToChannel(encodeURIComponent(selectedChannel.uri));
    }
  }, [goToChannel, selectedChannel]);

  const handleUnsubscribe = useCallback(async () => {
    if (!selectedChannel?.uri) return;

    Alert.alert(
      t('settings.unsubscribeChannel'),
      t('settings.unsubscribeConfirmWithName', {
        name: selectedChannel.displayName || selectedChannel.handle || t('feed.unknownChannel'),
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.unsubscribe'),
          onPress: async () => {
            try {
              await unsubscribeFromChannel(selectedChannel.uri!);
              voidTrueSheet(
                'dismiss',
                'settings-channels-sheet',
                TrueSheet.dismiss('settings-channels-sheet')
              );
              setSelectedChannel(null);
            } catch (error) {
              logger.error('Error unsubscribing from channel', error, {
                component: 'ChannelManagementScreen',
              });
              Alert.alert(t('common.error'), t('settings.failedToUnsubscribe'));
            }
          },
        },
      ]
    );
  }, [selectedChannel, unsubscribeFromChannel, t]);

  const handleExplorePress = useCallback(() => {
    router.dismissTo('/(tabs)/explore');
  }, [router]);

  const renderChannelItem = useCallback(
    ({ item }: { item: ChannelUser }) => {
      return (
        <SquircleNativePressable
          style={styles.channelItem}
          onPress={() => handleChannelPress(item)}
        >
          <Avatar
            uri={item.avatar}
            type="channel"
            size={40}
            ringColor="transparent"
            style={styles.channelAvatar}
            fallbackIcon="tv"
            fallbackIconSize={24}
            fallbackIconColor={Colors.neutral[200]}
          />
          <View style={styles.channelContent}>
            {item.isOrbytChannel ? (
              <View style={styles.orbytChannelName}>
                {item.uri && shouldShowChannelSlash(item.uri) && (
                  <Text
                    style={[styles.orbytSlash, { color: item.channelColor || Colors.amber[400] }]}
                  >
                    /
                  </Text>
                )}
                <Text style={styles.displayName} numberOfLines={1}>
                  {item.displayName || item.handle || t('feed.unknownChannel')}
                </Text>
              </View>
            ) : (
              <View style={styles.channelNameRow}>
                <Text style={styles.displayName} numberOfLines={1}>
                  {item.displayName || item.handle || t('feed.unknownChannel')}
                </Text>
              </View>
            )}
            {item.description && (
              <Text style={styles.description} numberOfLines={2}>
                {item.description}
              </Text>
            )}
          </View>
        </SquircleNativePressable>
      );
    },
    [handleChannelPress, t]
  );

  const renderEmpty = useCallback(
    () => (
      <View style={styles.emptyContainer}>
        <Icon name="tv_2" size={48} color={Colors.neutral[200]} style={styles.emptyIcon} />
        <Text style={styles.emptyTitle}>{t('settings.noChannelsYet')}</Text>
        <Text style={styles.emptySubtitle}>{t('settings.exploreChannelsSubscribe')}</Text>
        <SquircleNativePressable style={styles.exploreButton} onPress={handleExplorePress}>
          <Text style={styles.exploreButtonText}>{t('settings.exploreChannels')}</Text>
        </SquircleNativePressable>
      </View>
    ),
    [handleExplorePress, t]
  );

  return (
    <View style={[styles.container, { backgroundColor: Colors.neutral[975] }]}>
      <ListHeader
        mode="sheet"
        title={t('settings.channels')}
        showCloseButton
        onClosePress={() => router.dismiss()}
        applySafeAreaTop={false}
        backgroundColor={Colors.transparent}
      />
      <FlatList
        data={listData}
        renderItem={renderChannelItem}
        keyExtractor={(item, index) => item.uri || item.did || `channel-${index}`}
        showsVerticalScrollIndicator={
          listData.length >= SCROLL_INDICATOR_CONSTANTS.SETTINGS_CHANNELS_MIN_ITEMS
        }
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={[styles.listContainer, { paddingBottom: insets.bottom + 20 }]}
      />

      <VerticalListSheet
        name="settings-channels-sheet"
        onDismiss={() => setSelectedChannel(null)}
        scrollable={true}
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
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContainer: {
    paddingTop: 0,
  },
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: Colors.transparent,
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
  channelAvatar: {
    marginRight: 12,
  },
  channelContent: {
    flex: 1,
    justifyContent: 'center',
  },
  channelNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  orbytChannelName: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  orbytSlash: {
    fontSize: Typography.sizes.subtitle,
    marginBottom: 2,
    fontFamily: FontFamily.semibold,
    marginRight: 0,
  },
  displayName: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.subtitle,
    marginBottom: 2,
    fontFamily: FontFamily.bold,
    flexShrink: 1,
  },
  description: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.bodySmall,
    fontFamily: FontFamily.regular,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 100,
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
