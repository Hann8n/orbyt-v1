import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  FlatList,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Icon } from '../../components/ui/UI';
import { useSubscribedChannels } from '../../hooks/useSubscribedChannels';
import { SubscribedChannel } from '../../services/storage/ChannelSubscriptionManager';
import AtprotoService from '../../services/api/AtprotoService';

type ListItem = 
  | { type: 'header'; title: string; description: string }
  | { type: 'channel'; channel: SubscribedChannel; index: number }
  | { type: 'available-header'; title: string; description: string }
  | { type: 'available-channel'; channel: SubscribedChannel };

const ChannelManagementScreen: React.FC = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [isReordering, setIsReordering] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [availableDefaults, setAvailableDefaults] = useState<SubscribedChannel[]>([]);
  const [enrichedChannels, setEnrichedChannels] = useState<SubscribedChannel[]>([]);
  const { 
    channels, 
    isLoading, 
    refetch, 
    unsubscribeFromChannel, 
    reorderChannels,
    restoreDefaultChannel,
    getAvailableDefaultChannels
  } = useSubscribedChannels();

  // Load channels and available defaults on mount
  useEffect(() => {
    refetch();
    loadAvailableDefaults();
  }, [refetch]);

  // Enrich channels with feed details
  useEffect(() => {
    if (channels.length > 0) {
      enrichChannelsWithDetails();
    }
  }, [channels]);

  const enrichChannelsWithDetails = useCallback(async () => {
    const enriched = await Promise.all(
      channels.map(async (channel) => {
        // Skip enrichment for built-in feeds
        if (['following', 'yourMix'].includes(channel.uri)) {
          return channel;
        }

        try {
          // Try to get feed generator details
          const feedDetails = await AtprotoService.getFeedGenerator(channel.uri);
          if (feedDetails?.view) {
            return {
              ...channel,
              displayName: feedDetails.view.displayName || channel.displayName,
              description: feedDetails.view.description || channel.description,
              avatar: feedDetails.view.avatar || channel.avatar,
              memberCount: feedDetails.view.likeCount || channel.memberCount,
            };
          }
        } catch (error) {
          console.error(`Error enriching channel ${channel.uri}:`, error);
        }

        return channel;
      })
    );

    setEnrichedChannels(enriched);
  }, [channels]);

  const loadAvailableDefaults = useCallback(async () => {
    try {
      const defaults = await getAvailableDefaultChannels();
      setAvailableDefaults(defaults);
    } catch (error) {
      console.error('Error loading available defaults:', error);
    }
  }, [getAvailableDefaultChannels]);

  const handleUnsubscribe = useCallback(async (channel: SubscribedChannel) => {
    Alert.alert(
      'Remove Channel',
      `Are you sure you want to remove "${channel.displayName}"?${channel.isDefault ? ' You can restore it later from the available channels.' : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await unsubscribeFromChannel(channel.uri);
              await loadAvailableDefaults(); // Reload available defaults
            } catch (error) {
              console.error('Error unsubscribing:', error);
              Alert.alert('Error', 'Failed to remove channel. Please try again.');
            }
          },
        },
      ]
    );
  }, [unsubscribeFromChannel, loadAvailableDefaults]);

  const handleReorder = useCallback(async (fromIndex: number, toIndex: number) => {
    try {
      setIsReordering(true);
      const newChannels = [...enrichedChannels];
      const [movedChannel] = newChannels.splice(fromIndex, 1);
      newChannels.splice(toIndex, 0, movedChannel);
      
      // Save the new order
      const channelUris = newChannels.map(ch => ch.uri);
      await reorderChannels(channelUris);
    } catch (error) {
      console.error('Error reordering channels:', error);
      Alert.alert('Error', 'Failed to reorder channels. Please try again.');
    } finally {
      setIsReordering(false);
    }
  }, [enrichedChannels, reorderChannels]);

  const handleRestoreDefault = useCallback(async (channel: SubscribedChannel) => {
    try {
      await restoreDefaultChannel(channel.uri);
      await loadAvailableDefaults(); // Reload available defaults
      await refetch(); // Reload channels
    } catch (error) {
      console.error('Error restoring default channel:', error);
      Alert.alert('Error', 'Failed to restore channel. Please try again.');
    }
  }, [restoreDefaultChannel, loadAvailableDefaults, refetch]);

  const renderChannelItem = useCallback(({ item: channel, index }: { item: SubscribedChannel; index: number }) => {
    const isBuiltInFeed = ['following', 'yourMix'].includes(channel.uri);
    const isFollowing = channel.uri === 'following';
    const isYourMix = channel.uri === 'yourMix';
    
    return (
      <View style={[
        styles.channelItem,
        isBuiltInFeed && styles.builtInChannelItem
      ]}>
        <View style={styles.channelInfo}>
          <View style={[
            styles.avatarContainer,
            isBuiltInFeed && styles.builtInAvatarContainer
          ]}>
                         {isBuiltInFeed ? (
               <View style={styles.builtInAvatar}>
                 <Icon 
                   name={isFollowing ? "users" : "shuffle"} 
                   size={20} 
                   color="#999" 
                 />
               </View>
            ) : (
              <Avatar
                uri={channel.avatar}
                type="channel"
                size={44}
              />
            )}
          </View>
          
          <View style={styles.channelDetails}>
            <Text style={[
              styles.channelName,
              isBuiltInFeed && styles.builtInChannelName
            ]}>
              {channel.displayName}
            </Text>
            {isBuiltInFeed ? (
              <Text style={styles.builtInMemberCount}>
                {isFollowing ? "Posts from people you follow" : "Discover new content and creators"}
              </Text>
            ) : (
              <>
                {channel.description && (
                  <Text style={styles.channelDescription} numberOfLines={2}>
                    {channel.description}
                  </Text>
                )}
                {channel.memberCount && (
                  <Text style={styles.memberCount}>{channel.memberCount} members</Text>
                )}
              </>
            )}
          </View>
        </View>
        
        {isEditMode && (
          <View style={styles.channelActions}>
            <TouchableOpacity
              style={styles.unsubscribeButton}
              onPress={() => handleUnsubscribe(channel)}
              activeOpacity={0.7}
            >
              <Icon name="trash" size={16} color="#FE4359" />
            </TouchableOpacity>
            
            <View style={styles.reorderButtons}>
              <TouchableOpacity
                style={[styles.reorderButton, index === 0 && styles.reorderButtonDisabled]}
                onPress={() => index > 0 && handleReorder(index, index - 1)}
                disabled={index === 0}
                activeOpacity={0.7}
              >
                <Icon name="chevron-up" size={16} color={index === 0 ? "#333" : "#666"} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.reorderButton, index === enrichedChannels.length - 1 && styles.reorderButtonDisabled]}
                onPress={() => index < enrichedChannels.length - 1 && handleReorder(index, index + 1)}
                disabled={index === enrichedChannels.length - 1}
                activeOpacity={0.7}
              >
                <Icon name="chevron-down" size={16} color={index === enrichedChannels.length - 1 ? "#333" : "#666"} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  }, [handleUnsubscribe, enrichedChannels.length, isEditMode]);

  const renderAvailableChannelItem = useCallback(({ item: channel }: { item: SubscribedChannel }) => (
    <View style={styles.availableChannelItem}>
      <View style={styles.channelInfo}>
        <View style={styles.avatarContainer}>
          <Avatar
            uri={channel.avatar}
            type="channel"
            size={44}
          />
        </View>
        <View style={styles.channelDetails}>
          <Text style={styles.channelName}>{channel.displayName}</Text>
          <Text style={styles.channelDescription}>Default channel</Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.restoreButton}
        onPress={() => handleRestoreDefault(channel)}
        activeOpacity={0.7}
      >
        <Icon name="plus" size={16} color="#4CAF50" />
      </TouchableOpacity>
    </View>
  ), [handleRestoreDefault]);

  const renderHeaderItem = useCallback(({ item }: { item: { title: string; description: string } }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{item.title}</Text>
      <Text style={styles.sectionDescription}>{item.description}</Text>
    </View>
  ), []);

  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    switch (item.type) {
      case 'header':
        return renderHeaderItem({ item });
      case 'channel':
        return renderChannelItem({ item: item.channel, index: item.index });
      case 'available-header':
        return renderHeaderItem({ item });
      case 'available-channel':
        return renderAvailableChannelItem({ item: item.channel });
      default:
        return null;
    }
  }, [renderHeaderItem, renderChannelItem, renderAvailableChannelItem]);

  const getListData = useCallback((): ListItem[] => {
    const data: ListItem[] = [];
    
    // Your Channels section
    data.push({
      type: 'header',
      title: 'Your Channels',
      description: isEditMode 
        ? 'Use the arrows to reorder your channels. Tap the trash icon to remove channels.'
        : 'Tap Edit to reorder or remove channels.'
    });
    
    // Subscribed channels
    enrichedChannels.forEach((channel, index) => {
      data.push({
        type: 'channel',
        channel,
        index
      });
    });
    
    // Available channels section (if any)
    if (availableDefaults.length > 0) {
      data.push({
        type: 'available-header',
        title: 'Available Channels',
        description: 'These channels can be added back to your feed.'
      });
      
      availableDefaults.forEach((channel) => {
        data.push({
          type: 'available-channel',
          channel
        });
      });
    }
    
    return data;
  }, [enrichedChannels, availableDefaults, isEditMode]);

  const keyExtractor = useCallback((item: ListItem, index: number) => {
    switch (item.type) {
      case 'header':
      case 'available-header':
        return `header-${index}`;
      case 'channel':
        return `channel-${item.channel.uri}`;
      case 'available-channel':
        return `available-${item.channel.uri}`;
      default:
        return `item-${index}`;
    }
  }, []);

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Icon name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Manage Channels</Text>
          <View style={styles.headerSpacer} />
        </View>
        
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Loading channels...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Icon name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Manage Channels</Text>
        <TouchableOpacity 
          style={[styles.editButton, isEditMode && styles.editButtonActive]}
          onPress={() => setIsEditMode(!isEditMode)}
          activeOpacity={0.7}
        >
          <Text style={[styles.editButtonText, isEditMode && styles.editButtonTextActive]}>
            {isEditMode ? 'Done' : 'Edit'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <FlatList
        data={getListData()}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: '#333',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },
  headerSpacer: {
    width: 40,
  },
  editButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#333',
  },
  editButtonActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  editButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },
  editButtonTextActive: {
    color: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 16,
    fontFamily: 'Firma-Medium',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  separator: {
    height: 12,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
    marginBottom: 8,
  },
  sectionDescription: {
    color: '#666',
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    lineHeight: 20,
  },
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  builtInChannelItem: {
    backgroundColor: '#1A1A1A',
    borderColor: '#444',
    borderWidth: 1.5,
  },
  availableChannelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  channelInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatarContainer: {
    marginRight: 12,
    marginTop: 2,
  },
  builtInAvatarContainer: {
    marginRight: 12,
    marginTop: 2,
  },
  builtInAvatar: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#444',
  },

  channelDetails: {
    flex: 1,
  },
  channelNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  builtInChannelName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Firma-Bold',
  },
  builtInBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: '#333',
  },
  followingBadge: {
    backgroundColor: '#4CAF50',
  },
  yourMixBadge: {
    backgroundColor: '#FF6B35',
  },
  builtInBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },
  channelName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
    marginBottom: 4,
  },
  channelDescription: {
    color: '#999',
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    marginBottom: 4,
  },
  memberCount: {
    color: '#666',
    fontSize: 12,
    fontFamily: 'Firma-Regular',
  },
  builtInMemberCount: {
    color: '#999',
    fontSize: 12,
    fontFamily: 'Firma-Regular',
    fontStyle: 'italic',
  },
  followingMemberCount: {
    color: '#4CAF50',
  },
  yourMixMemberCount: {
    color: '#FF6B35',
  },
  builtInChannelDescription: {
    color: '#BBB',
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    marginBottom: 4,
  },
  channelActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  unsubscribeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FE4359',
  },
  reorderButtons: {
    flexDirection: 'column',
    gap: 6,
  },
  reorderButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderButtonDisabled: {
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#333',
  },
  restoreButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
});

export default ChannelManagementScreen; 