import React, { useEffect, useCallback, useMemo, useState } from 'react';
import { Alert, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import { FlashList } from '@shopify/flash-list';

import { useSubscribedChannels } from '../../src/hooks/useSubscribedChannels';
import { Colors } from '../../src/components/ui/UI';
import { Avatar, Icon } from '../../src/components/ui/UI';
import { BORDER_RADIUS } from '../../src/utils/constants';
import { hexToRGBA } from '../../src/utils/formatting/colorUtils';
import ListHeader from '../../src/components/ui/ListHeader';

interface ChannelUser {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  description?: string;
  isChannel?: boolean;
  uri?: string;
}

export default function ChannelManagementScreen() {
  const navigation = useRouter();
  const insets = useSafeAreaInsets();
  
  const {
    subscribedChannels: channels,
    reorderChannels,
    unsubscribeFromChannel,
    restoreDefaultChannel,
    getAvailableDefaultChannels,
  } = useSubscribedChannels();

  // Edit mode state
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [availableDefaults, setAvailableDefaults] = useState<ChannelUser[]>([]);

  // Transform channels data
  const listData = useMemo((): ChannelUser[] => {
    return channels.map((channel) => {
      // Add default avatars for built-in feeds
      let avatar = channel.avatar;
      if (channel.uri === 'following') {
        // Use a generic following icon - could be a people/users icon
        avatar = undefined; // Will use fallback icon
      } else if (channel.uri === 'yourMix') {
        // Use a generic mix/blend icon
        avatar = undefined; // Will use fallback icon
      }
      
      return {
        did: channel.uri,
        handle: channel.uri.split('/').pop() || '',
        displayName: channel.displayName,
        avatar: avatar,
        description: channel.description,
        isChannel: true,
        uri: channel.uri,
      };
    });
  }, [channels]);

  // Load available default channels
  useEffect(() => {
    const loadAvailableDefaults = async () => {
      try {
        const defaults = await getAvailableDefaultChannels();
        const transformedDefaults = defaults.map((channel) => ({
          did: channel.uri,
          handle: channel.uri.split('/').pop() || '',
          displayName: channel.displayName,
          avatar: undefined,
          description: channel.description,
          isChannel: true,
          uri: channel.uri,
        }));
        setAvailableDefaults(transformedDefaults);
      } catch (error) {
        console.error('Error loading available defaults:', error);
      }
    };
    loadAvailableDefaults();
  }, [getAvailableDefaultChannels, channels]);

  const handleChannelPress = useCallback((channel: ChannelUser) => {
    if (channel.uri) {
      const encodedUri = encodeURIComponent(channel.uri);
      navigation.push(`/channel/${encodedUri}`);
    }
  }, [navigation]);

  const handleUnsubscribe = useCallback(async (channel: ChannelUser) => {
    if (!channel.uri) return;
    
    const isDefaultChannel = ['following', 'yourMix'].includes(channel.uri);
    const title = isDefaultChannel ? 'Remove Default Channel' : 'Unsubscribe from Channel';
    const message = isDefaultChannel 
      ? `Remove "${channel.displayName}" from your channels? You can add it back anytime.`
      : `Are you sure you want to unsubscribe from "${channel.displayName}"?`;
    
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isDefaultChannel ? 'Remove' : 'Unsubscribe',
          style: 'destructive',
          onPress: async () => {
            try {
              await unsubscribeFromChannel(channel.uri!);
              // Channel automatically updated in store
            } catch (error) {
              console.error('Error unsubscribing from channel:', error);
              Alert.alert('Error', 'Failed to unsubscribe from channel. Please try again.');
            }
          }
        }
      ]
    );
  }, [unsubscribeFromChannel]);

  const handleRestoreDefault = useCallback(async (channel: ChannelUser) => {
    if (!channel.uri) return;
    
    try {
      await restoreDefaultChannel(channel.uri);
      // Refresh available defaults
      const defaults = await getAvailableDefaultChannels();
      const transformedDefaults = defaults.map((ch) => ({
        did: ch.uri,
        handle: ch.uri.split('/').pop() || '',
        displayName: ch.displayName,
        avatar: undefined,
        description: ch.description,
        isChannel: true,
        uri: ch.uri,
      }));
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

  const handleDragEnd = useCallback(async ({ data }: { data: ChannelUser[] }) => {
    try {
      const reorderedChannels = data.map((channel, index) => {
        const isDefaultChannel = ['following', 'yourMix'].includes(channel.uri || channel.did);
        
        return {
          uri: channel.uri || channel.did,
          displayName: channel.displayName || channel.handle || 'Unknown channel',
          description: channel.description,
          avatar: channel.avatar,
          isDefault: isDefaultChannel,
          order: index,
          subscribedAt: Date.now(),
        };
      });
      
      await reorderChannels(reorderedChannels);
    } catch (error) {
      console.error('Error reordering channels:', error);
      Alert.alert('Error', 'Failed to reorder channels. Please try again.');
    }
  }, [reorderChannels]);

  const renderChannelItem = useCallback(({ item, drag, isActive }: { 
    item: ChannelUser; 
    drag: () => void; 
    isActive: boolean; 
  }) => (
    <ScaleDecorator>
      <TouchableOpacity
        style={[styles.channelItem, isActive && styles.activeChannelItem]}
        onPress={() => handleChannelPress(item)}
        onLongPress={drag}
        activeOpacity={0.7}
        disabled={isActive}
      >
        <Avatar 
          uri={item.avatar} 
          type="channel" 
          size={40} 
          ringColor="transparent" 
          style={styles.channelAvatar}
          fallbackIcon={item.uri === 'following' ? 'users' : item.uri === 'yourMix' ? 'shuffle' : 'tv'}
          fallbackIconSize={24}
          fallbackIconColor={item.uri === 'following' ? '#FFFFFF' : item.uri === 'yourMix' ? '#FFFFFF' : Colors.lightGray}
          profileColors={item.uri === 'following' ? { backgroundColor: '#3B82F6', foregroundColor: '#FFFFFF', textColor: '#FFFFFF' } : item.uri === 'yourMix' ? { backgroundColor: '#10B981', foregroundColor: '#FFFFFF', textColor: '#FFFFFF' } : undefined}
        />
        <View style={styles.channelContent}>
          <Text style={styles.displayName} numberOfLines={1}>
            {item.displayName || item.handle || 'Unknown channel'}
          </Text>
          {item.description && (
            <Text style={styles.description} numberOfLines={2}>
              {item.description}
            </Text>
          )}
        </View>
        <View style={styles.actionButtons}>
          {!isEditMode && (
            <TouchableOpacity
              style={styles.dragHandle}
              onPressIn={drag}
              activeOpacity={0.7}
            >
              <Icon name="menu-fill" size={20} color={Colors.lightGray} />
            </TouchableOpacity>
          )}
          {isEditMode && (
            <TouchableOpacity
              style={styles.unsubscribeButton}
              onPress={() => handleUnsubscribe(item)}
              activeOpacity={0.7}
              disabled={isActive}
            >
              <Icon name="delete-2-fill" size={16} color={Colors.STATUS.ERROR} />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    </ScaleDecorator>
  ), [handleChannelPress, handleUnsubscribe, isEditMode]);

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

  // No loading state needed - channels are loaded from store
  if (false) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.black }]}>
        <FlashList
          data={[]}
          renderItem={() => null}
          keyExtractor={() => 'loading'}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={renderListHeader}
          ListEmptyComponent={() => (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Loading channels...</Text>
            </View>
          )}
          contentContainerStyle={[
            styles.listContainer,
            { paddingBottom: insets.bottom + 20 }
          ]}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: Colors.black }]}>
      <DraggableFlatList
        data={listData}
        renderItem={renderChannelItem}
        keyExtractor={(item) => item.did}
        onDragEnd={handleDragEnd}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={renderListHeader}
        ListEmptyComponent={renderEmpty}
        extraData={isEditMode}
        ListFooterComponent={() => (
          <View>
            {availableDefaults.length > 0 && isEditMode && (
              <View style={styles.restoreSection}>
                <Text style={[styles.restoreTitle, { marginHorizontal: 20 }]}>Default Channels</Text>
                {availableDefaults.map((channel) => (
                  <TouchableOpacity
                    key={channel.uri}
                    style={styles.channelItem}
                    onPress={() => handleRestoreDefault(channel)}
                    activeOpacity={0.7}
                  >
                    <Avatar 
                      uri={channel.avatar} 
                      type="channel" 
                      size={40} 
                      ringColor="transparent" 
                      style={styles.channelAvatar}
                      fallbackIcon={channel.uri === 'following' ? 'users' : channel.uri === 'yourMix' ? 'shuffle' : 'tv'}
                      fallbackIconSize={24}
                      fallbackIconColor={channel.uri === 'following' ? '#FFFFFF' : channel.uri === 'yourMix' ? '#FFFFFF' : Colors.lightGray}
                      profileColors={channel.uri === 'following' ? { backgroundColor: '#3B82F6', foregroundColor: '#FFFFFF', textColor: '#FFFFFF' } : channel.uri === 'yourMix' ? { backgroundColor: '#10B981', foregroundColor: '#FFFFFF', textColor: '#FFFFFF' } : undefined}
                    />
                    <View style={styles.channelContent}>
                      <Text style={styles.displayName} numberOfLines={1}>
                        {channel.displayName}
                      </Text>
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
                ))}
              </View>
            )}
            <TouchableOpacity
              onPress={() => setIsEditMode(!isEditMode)}
              activeOpacity={0.8}
              style={{ paddingVertical: 20 }}
            >
              <Text style={styles.editButtonText}>
                {isEditMode ? 'Done' : 'Edit'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        contentContainerStyle={[
          styles.listContainer,
          { paddingBottom: insets.bottom + 20 }
        ]}
      />
    </View>
  );
};

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
  activeChannelItem: {
    backgroundColor: Colors.black,
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dragHandle: {
    padding: 8,
    backgroundColor: hexToRGBA(Colors.lightGray, 0.1),
    borderRadius: BORDER_RADIUS.SMALL,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
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
  displayName: {
    color: Colors.white,
    fontSize: 16,
    marginBottom: 2,
    fontFamily: 'Firma-SemiBold',
    flexShrink: 1,
  },
  description: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
  },
  unsubscribeButton: {
    padding: 8,
    backgroundColor: hexToRGBA(Colors.STATUS.ERROR, 0.1),
    borderRadius: BORDER_RADIUS.SMALL,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  loadingText: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Firma-Medium',
  },
  editButtonText: {
    color: Colors.lightGray,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: 'Firma-SemiBold',
    marginTop: 8,
    marginBottom: 12,
  },
  restoreSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: hexToRGBA(Colors.lightGray, 0.1),
  },
  restoreTitle: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Firma-SemiBold',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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