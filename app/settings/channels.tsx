import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { Alert, View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSubscribedChannels } from '../../src/hooks/useSubscribedChannels';
import { Colors } from '../../src/components/ui/UI';
import { Avatar, Icon } from '../../src/components/ui/UI';
import { BORDER_RADIUS } from '../../src/utils/constants';
import { hexToRGBA } from '../../src/utils/formatting/colorUtils';
import ListHeader from '../../src/components/ui/ListHeader';
import VerticalListSheet, { VerticalListButton } from '../../src/components/ui/VerticalListSheet';
import { isOrbytChannel, getChannelByUri, getChannelAvatarUri, shouldShowChannelSlash } from '../../src/utils/orbytChannels';
import { DEFAULT_CHANNELS } from '../../src/stores/userStore';

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
  isDefault?: boolean;
}

export default function ChannelManagementScreen() {
  const navigation = useRouter();
  const insets = useSafeAreaInsets();
  
  const {
    subscribedChannels: channels,
    unsubscribeFromChannel,
    setDefaultChannel,
    getAvailableDefaultChannels,
    restoreDefaultChannel,
  } = useSubscribedChannels();

  const [selectedChannel, setSelectedChannel] = useState<ChannelUser | null>(null);
  const [isSheetVisible, setIsSheetVisible] = useState(false);
  const [availableDefaults, setAvailableDefaults] = useState<ChannelUser[]>([]);
  const [displayedTitle, setDisplayedTitle] = useState<string>('');

  // Transform channels data
  const listData = useMemo((): ChannelUser[] => {
    return channels.map((channel) => {
      // Add default avatars for built-in feeds
      let avatar = channel.avatar;
      if (channel.uri === 'following') {
        avatar = undefined; // Will use fallback icon
      } else {
        avatar = getChannelAvatarUri(channel.uri, channel.avatar);
      }
      
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
        isDefault: channel.isDefault,
      };
    });
  }, [channels]);

  // Load available default channels
  useEffect(() => {
    const loadAvailableDefaults = async () => {
      try {
        const defaults = await getAvailableDefaultChannels();
        const transformedDefaults = defaults.map((channel) => {
          const isOrbyt = channel.isOrbytChannel ?? isOrbytChannel(channel.uri);
          const orbytChannel = isOrbyt ? getChannelByUri(channel.uri) : undefined;
          const avatar = channel.uri === 'following' ? undefined : getChannelAvatarUri(channel.uri, channel.avatar);
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
            isDefault: false,
          };
        });
        setAvailableDefaults(transformedDefaults);
      } catch (error) {
        console.error('Error loading available defaults:', error);
      }
    };
    loadAvailableDefaults();
  }, [getAvailableDefaultChannels, channels]);

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

  const handleSetAsDefault = useCallback(async () => {
    if (!selectedChannel?.uri) return;
    
    // Only allow 'following' or 'your-mix' as default
    if (selectedChannel.uri !== 'following' && selectedChannel.uri !== 'your-mix') {
      Alert.alert('Invalid Selection', 'Only "Following" or "Your Mix" can be set as the default feed.');
      return;
    }
    
    try {
      await setDefaultChannel(selectedChannel.uri);
      setIsSheetVisible(false);
      setSelectedChannel(null);
    } catch (error) {
      console.error('Error setting default channel:', error);
      Alert.alert('Error', 'Failed to set default channel. Please try again.');
    }
  }, [selectedChannel, setDefaultChannel]);

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
    
    const isBuiltInChannel = DEFAULT_CHANNELS.some(ch => ch.uri === selectedChannel.uri);
    const title = isBuiltInChannel ? 'Remove Built-in Channel' : 'Unsubscribe from Channel';
    const message = isBuiltInChannel 
      ? `Remove "${selectedChannel.displayName}" from your channels? You can add it back anytime.`
      : `Are you sure you want to unsubscribe from "${selectedChannel.displayName}"?`;
    
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isBuiltInChannel ? 'Remove' : 'Unsubscribe',
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

  const handleRestoreDefault = useCallback(async (channel: ChannelUser) => {
    if (!channel.uri) return;
    
    try {
      await restoreDefaultChannel(channel.uri);
      // Refresh available defaults
      const defaults = await getAvailableDefaultChannels();
      const transformedDefaults = defaults.map((ch) => {
        const isOrbyt = ch.isOrbytChannel ?? isOrbytChannel(ch.uri);
        const orbytChannel = isOrbyt ? getChannelByUri(ch.uri) : undefined;
        const avatar = ch.uri === 'following' ? undefined : getChannelAvatarUri(ch.uri, ch.avatar);
        return {
          did: ch.uri,
          handle: ch.uri.split('/').pop() || '',
          displayName: ch.displayName,
          avatar: avatar,
          description: ch.description,
          isChannel: true,
          isOrbytChannel: isOrbyt,
          channelColor: orbytChannel?.channelColor,
          uri: ch.uri,
          isDefault: false,
        };
      });
      setAvailableDefaults(transformedDefaults);
    } catch (error) {
      console.error('Error restoring default channel:', error);
      Alert.alert('Error', 'Failed to restore channel. Please try again.');
    }
  }, [restoreDefaultChannel, getAvailableDefaultChannels]);

  const handleExplorePress = useCallback(() => {
    navigation.back();
    setTimeout(() => {
      navigation.push('/explore');
    }, 100);
  }, [navigation]);

  const renderChannelItem = useCallback(({ item }: { 
    item: ChannelUser; 
  }) => {
    const isBuiltInChannel = DEFAULT_CHANNELS.some(ch => ch.uri === item.uri);
    const fallbackIcon = item.uri === 'following' ? 'users' : (item.uri === 'your-mix' ? 'shuffle' : 'tv');
    const fallbackIconColor = item.uri === 'following' ? '#1e3a8a' : (item.uri === 'your-mix' ? '#581c87' : (isBuiltInChannel ? '#FFFFFF' : Colors.lightGray));
    const profileColors = item.uri === 'following' 
      ? { backgroundColor: '#3B82F6', foregroundColor: '#FFFFFF', textColor: '#FFFFFF' }
      : (item.uri === 'your-mix' 
        ? { backgroundColor: '#9333ea', foregroundColor: '#FFFFFF', textColor: '#FFFFFF' }
        : undefined);
    const showDefaultBadge = item.isDefault;

    return (
      <TouchableOpacity
        style={styles.channelItem}
        onPress={() => handleChannelPress(item)}
        activeOpacity={0.7}
      >
        <Avatar 
          uri={item.avatar} 
          type="channel" 
          size={40} 
          ringColor="transparent" 
          style={styles.channelAvatar}
          fallbackIcon={fallbackIcon}
          fallbackIconSize={24}
          fallbackIconColor={fallbackIconColor}
          profileColors={profileColors}
        />
        <View style={styles.channelContent}>
          {item.isOrbytChannel ? (
            <View style={styles.orbytChannelName}>
              {item.uri && shouldShowChannelSlash(item.uri) && (
                <Text style={[styles.orbytSlash, { color: item.channelColor || '#FFD700' }]}>/</Text>
              )}
              <Text style={styles.displayName} numberOfLines={1}>
                {item.displayName || item.handle || 'Unknown channel'}
              </Text>
              {showDefaultBadge && (
                <View style={styles.defaultBadge}>
                  <Icon name="star-fill" size={14} color={Colors.green} />
                </View>
              )}
            </View>
          ) : (
            <View style={styles.channelNameRow}>
              <Text style={styles.displayName} numberOfLines={1}>
                {item.displayName || item.handle || 'Unknown channel'}
              </Text>
              {showDefaultBadge && (
                <View style={styles.defaultBadge}>
                  <Icon name="star-fill" size={14} color={Colors.green} />
                </View>
              )}
            </View>
          )}
          {item.description && (
            <Text style={styles.description} numberOfLines={2}>
              {item.description}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  }, [handleChannelPress]);

  const renderEmpty = useCallback(() => (
    <View style={styles.emptyContainer}>
      <Icon name="tv" size={48} color={Colors.lightGray} style={styles.emptyIcon} />
      <Text style={styles.emptyTitle}>No channels yet</Text>
      <Text style={styles.emptySubtitle}>Explore channels to subscribe to them</Text>
      <TouchableOpacity
        style={styles.exploreButton}
        onPress={handleExplorePress}
        activeOpacity={0.7}
      >
        <Text style={styles.exploreButtonText}>Explore Channels</Text>
      </TouchableOpacity>
    </View>
  ), [handleExplorePress]);

  const renderListHeader = useCallback(() => (
    <View>
      <ListHeader 
        mode="sheet"
        title="channels"
        showCloseButton
        onClosePress={() => navigation.back()}
        applySafeAreaTop={false}
        style={{ marginHorizontal: -5 }}
      />
    </View>
  ), [navigation]);

  const sheetTitle = displayedTitle || 'Channel Options';

  return (
    <View style={[styles.container, { backgroundColor: Colors.black }]}>
      <FlatList
        data={listData}
        renderItem={renderChannelItem}
        keyExtractor={(item, index) => item.uri || item.did || `channel-${index}`}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={renderListHeader}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={() => (
          availableDefaults.length > 0 ? (
            <View style={styles.restoreSection}>
              <Text style={styles.restoreTitle}>Built-in Channels</Text>
              {availableDefaults.map((channel) => {
                const isBuiltInChannel = DEFAULT_CHANNELS.some(ch => ch.uri === channel.uri);
                const fallbackIcon = channel.uri === 'following' ? 'users' : (channel.uri === 'your-mix' ? 'shuffle' : 'tv');
                const fallbackIconColor = channel.uri === 'following' ? '#1e3a8a' : (channel.uri === 'your-mix' ? '#581c87' : (isBuiltInChannel ? '#FFFFFF' : Colors.lightGray));
                const profileColors = channel.uri === 'following' 
                  ? { backgroundColor: '#3B82F6', foregroundColor: '#FFFFFF', textColor: '#FFFFFF' }
                  : (channel.uri === 'your-mix' 
                    ? { backgroundColor: '#9333ea', foregroundColor: '#FFFFFF', textColor: '#FFFFFF' }
                    : undefined);

                return (
                  <TouchableOpacity
                    key={channel.uri}
                    style={styles.restoreChannelItem}
                    onPress={() => handleRestoreDefault(channel)}
                    activeOpacity={0.7}
                  >
                    <Avatar 
                      uri={channel.avatar} 
                      type="channel" 
                      size={40} 
                      ringColor="transparent" 
                      style={styles.channelAvatar}
                      fallbackIcon={fallbackIcon}
                      fallbackIconSize={24}
                      fallbackIconColor={fallbackIconColor}
                      profileColors={profileColors}
                    />
                    <View style={styles.channelContent}>
                      {channel.isOrbytChannel ? (
                        <View style={styles.orbytChannelName}>
                          {channel.uri && shouldShowChannelSlash(channel.uri) && (
                            <Text style={[styles.orbytSlash, { color: channel.channelColor || '#FFD700' }]}>/</Text>
                          )}
                          <Text style={styles.displayName} numberOfLines={1}>
                            {channel.displayName}
                          </Text>
                        </View>
                      ) : (
                        <Text style={styles.displayName} numberOfLines={1}>
                          {channel.displayName}
                        </Text>
                      )}
                    </View>
                    <View style={styles.actionButtons}>
                      <TouchableOpacity
                        style={styles.restoreButton}
                        onPress={() => handleRestoreDefault(channel)}
                        activeOpacity={0.7}
                      >
                        <Icon name="plus" size={16} color={Colors.green} />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null
        )}
        contentContainerStyle={[
          styles.listContainer,
          { paddingBottom: insets.bottom + 20 }
        ]}
      />
      
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
          {selectedChannel && !selectedChannel.isDefault && (selectedChannel.uri === 'following' || selectedChannel.uri === 'your-mix') && (
            <VerticalListButton
              label="Set as Default"
              onPress={handleSetAsDefault}
            />
          )}
          {selectedChannel && !DEFAULT_CHANNELS.some(ch => ch.uri === selectedChannel.uri) && (
            <VerticalListButton
              label="View"
              onPress={handleViewChannel}
            />
          )}
          <VerticalListButton
            label={DEFAULT_CHANNELS.some(ch => ch.uri === selectedChannel?.uri) ? 'Remove' : 'Unsubscribe'}
            onPress={handleUnsubscribe}
          />
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
    backgroundColor: 'transparent',
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  channelAvatar: {
    width: 40,
    height: 40,
    marginRight: 12,
    borderWidth: 0,
    borderColor: 'transparent',
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
    fontFamily: 'Firma-SemiBold',
    marginRight: 0,
  },
  displayName: {
    color: Colors.white,
    fontSize: 16,
    marginBottom: 2,
    fontFamily: 'Firma-Bold',
    flexShrink: 1,
  },
  defaultBadge: {
    marginLeft: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  description: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
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
  restoreSection: {
    marginTop: 20,
    paddingTop: 20,
  },
  restoreTitle: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Firma-SemiBold',
    marginBottom: 12,
    marginHorizontal: 20,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  restoreChannelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
  restoreButton: {
    padding: 8,
    backgroundColor: Colors.darkGreen,
    borderRadius: BORDER_RADIUS.SMALL,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
});
