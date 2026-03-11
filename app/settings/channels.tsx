import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View, Text, StyleSheet, Pressable, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSubscribedChannels } from '../../src/hooks/useSubscribedChannels';
import { Colors } from '../../src/theme';
import { Avatar, Icon } from '../../src/components/ui/UI';
import { BORDER_RADIUS } from '../../src/utils/constants';
import ListHeader from '../../src/components/ui/ListHeader';
import VerticalListSheet, {
  VerticalListButton,
  TrueSheet,
} from '../../src/components/ui/VerticalListSheet';
import {
  isOrbytChannel,
  getChannelByUri,
  getChannelAvatarUri,
  shouldShowChannelSlash,
} from '../../src/utils/channels/orbyt';
import { logger } from '../../src/utils/logger';

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
  const insets = useSafeAreaInsets();

  const { subscribedChannels: channels, unsubscribeFromChannel } = useSubscribedChannels();

  const [selectedChannel, setSelectedChannel] = useState<ChannelUser | null>(null);
  const [displayedTitle, setDisplayedTitle] = useState<string>('');

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

  const handleChannelPress = useCallback(
    (channel: ChannelUser) => {
      setSelectedChannel(channel);
      TrueSheet.present('settings-channels-sheet');
      // Set the displayed title immediately
      if (channel.isOrbytChannel && channel.uri && shouldShowChannelSlash(channel.uri)) {
        setDisplayedTitle(`/${channel.displayName || channel.handle || t('feed.unknownChannel')}`);
      } else {
        setDisplayedTitle(channel.displayName || channel.handle || t('feed.unknownChannel'));
      }
    },
    [t]
  );

  const handleViewChannel = useCallback(() => {
    if (selectedChannel?.uri) {
      TrueSheet.dismiss('settings-channels-sheet');
      setSelectedChannel(null);
      router.navigate({
        pathname: '/channel/[id]',
        params: { id: selectedChannel.uri },
      });
    }
  }, [selectedChannel, router]);

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
              TrueSheet.dismiss('settings-channels-sheet');
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
        <Pressable style={styles.channelItem} onPress={() => handleChannelPress(item)}>
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
        </Pressable>
      );
    },
    [handleChannelPress, t]
  );

  const renderEmpty = useCallback(
    () => (
      <View style={styles.emptyContainer}>
        <Icon name="tv" size={48} color={Colors.neutral[200]} style={styles.emptyIcon} />
        <Text style={styles.emptyTitle}>{t('settings.noChannelsYet')}</Text>
        <Text style={styles.emptySubtitle}>{t('settings.exploreChannelsSubscribe')}</Text>
        <Pressable style={styles.exploreButton} onPress={handleExplorePress}>
          <Text style={styles.exploreButtonText}>{t('settings.exploreChannels')}</Text>
        </Pressable>
      </View>
    ),
    [handleExplorePress, t]
  );

  return (
    <View style={[styles.container, { backgroundColor: Colors.black }]}>
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
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={[styles.listContainer, { paddingBottom: insets.bottom + 20 }]}
      />

      <VerticalListSheet
        name="settings-channels-sheet"
        onDismiss={() => setSelectedChannel(null)}
        title={displayedTitle || t('settings.channelOptions')}
        scrollable={true}
        showCancelButton={true}
      >
        <View style={styles.sheetContent}>
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
    fontSize: 16,
    marginBottom: 2,
    fontFamily: 'Figtree-SemiBold',
    marginRight: 0,
  },
  displayName: {
    color: Colors.neutral[50],
    fontSize: 16,
    marginBottom: 2,
    fontFamily: 'Figtree-Bold',
    flexShrink: 1,
  },
  description: {
    color: Colors.neutral[200],
    fontSize: 14,
    fontFamily: 'Figtree-Regular',
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
    fontSize: 20,
    fontFamily: 'Figtree-Bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: Colors.neutral[200],
    fontSize: 16,
    fontFamily: 'Figtree-Medium',
    textAlign: 'center',
    lineHeight: 22,
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
    fontSize: 16,
    fontFamily: 'Figtree-SemiBold',
  },
  sheetContent: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
});
