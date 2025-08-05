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
  Switch,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Icon } from '../../components/ui/UI';
import { useSubscribedChannels } from '../../hooks/useSubscribedChannels';
import { SubscribedChannel } from '../../services/storage/ChannelSubscriptionManager';
import AtprotoService from '../../services/api/AtprotoService';
import { formatNumber } from '../../utils/helpers/formatNumber';

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
  const [draftChannels, setDraftChannels] = useState<SubscribedChannel[]>([]);
  const { 
    channels, 
    isLoading, 
    refetch, 
    unsubscribeFromChannel, 
    reorderChannels,
    restoreDefaultChannel,
    getAvailableDefaultChannels,
    addToMix,
    removeFromMix,
    excludeChannel,
    includeChannel,
  } = useSubscribedChannels();

  // Load channels and available defaults on mount
  useEffect(() => {
    refetch();
    loadAvailableDefaults();
  }, [refetch]);



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
              // Remove from draft channels immediately
              setDraftChannels(prev => prev.filter(ch => ch.uri !== channel.uri));
              
              // Also remove from the actual channels list
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

  const handleReorder = useCallback((fromIndex: number, toIndex: number) => {
    console.log('handleReorder called with fromIndex:', fromIndex, 'toIndex:', toIndex);
    
    // Prevent moving channels into built-in feed positions (0 and 1)
    if (toIndex < 2) {
      console.log('Cannot move channel into built-in feed position');
      return;
    }
    
    // Create new array with reordered channels
    const newChannels = [...draftChannels];
    console.log('Original channels:', newChannels.map(ch => ch.displayName));
    
    const [movedChannel] = newChannels.splice(fromIndex, 1);
    newChannels.splice(toIndex, 0, movedChannel);
    
    console.log('Reordered channels:', newChannels.map(ch => ch.displayName));
    
    // Update draft state
    setDraftChannels(newChannels);
  }, [draftChannels]);

  const handleSaveChanges = useCallback(async () => {
    try {
      setIsReordering(true);
      
      // Save the new order
      const channelUris = draftChannels.map(ch => ch.uri);
      await reorderChannels(channelUris);
      console.log('Changes saved successfully');
      
      // Refresh the data
      await refetch();
      
      // Exit edit mode
      setIsEditMode(false);
      setDraftChannels([]);
    } catch (error) {
      console.error('Error saving changes:', error);
      Alert.alert('Error', 'Failed to save changes. Please try again.');
    } finally {
      setIsReordering(false);
    }
  }, [draftChannels, reorderChannels, refetch]);

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

  const handleToggleMix = useCallback(async (channel: SubscribedChannel, inMix: boolean) => {
    try {
      if (inMix) {
        await addToMix(channel.uri);
      } else {
        await removeFromMix(channel.uri);
      }
    } catch (error) {
      console.error('Error toggling mix:', error);
      Alert.alert('Error', 'Failed to update mix settings. Please try again.');
    }
  }, [addToMix, removeFromMix]);

  const handleToggleExclude = useCallback(async (channel: SubscribedChannel, isExcluded: boolean) => {
    try {
      if (isExcluded) {
        await excludeChannel(channel.uri);
      } else {
        await includeChannel(channel.uri);
      }
    } catch (error) {
      console.error('Error toggling exclude:', error);
      Alert.alert('Error', 'Failed to update exclude settings. Please try again.');
    }
  }, [excludeChannel, includeChannel]);

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
          {isEditMode && !isBuiltInFeed ? (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleUnsubscribe(channel)}
              activeOpacity={0.7}
            >
              <Icon name="trash" size={20} color="#000" />
            </TouchableOpacity>
          ) : (
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
          )}
          
          <View style={styles.channelDetails}>
            <View style={styles.channelNameRow}>
              <Text style={[
                styles.channelName,
                isBuiltInFeed && styles.builtInChannelName
              ]}>
                {channel.displayName}
              </Text>
              {!isEditMode && !isBuiltInFeed && (
                <TouchableOpacity
                  style={styles.mixIconButton}
                  onPress={() => {
                    if (channel.isExcluded) {
                      handleToggleExclude(channel, false);
                    } else if (channel.inMix) {
                      handleToggleMix(channel, false);
                    } else {
                      handleToggleMix(channel, true);
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Icon 
                    name="shuffle" 
                    size={16} 
                    color={
                      channel.isExcluded ? '#FE4359' : 
                      channel.inMix && !channel.isExcluded ? '#4CAF50' : '#666'
                    } 
                  />
                </TouchableOpacity>
              )}
            </View>
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
                  <Text style={styles.memberCount}>{formatNumber(channel.memberCount)} members</Text>
                )}
              </>
            )}
          </View>
        </View>
        
        <View style={styles.channelActions}>
          {isEditMode ? (
            <>
                              {!isBuiltInFeed && (
                  <View style={styles.reorderButtons}>
                    <TouchableOpacity
                      style={[
                        styles.reorderButton, 
                        index === 2 && styles.reorderButtonDisabled,
                        isReordering && styles.reorderButtonDisabled
                      ]}
                      onPress={() => {
                        if (!isReordering && index > 2) {
                          console.log('Moving channel from index', index, 'to index', index - 1);
                          handleReorder(index, index - 1);
                        }
                      }}
                      disabled={index === 2 || isReordering}
                      activeOpacity={0.7}
                    >
                      <Icon name="chevron-up" size={20} color={(index === 2 || isReordering) ? "#666" : "#fff"} />
                    </TouchableOpacity>
                    <TouchableOpacity
                                           style={[
                       styles.reorderButton, 
                       index === draftChannels.length - 1 && styles.reorderButtonDisabled,
                       isReordering && styles.reorderButtonDisabled
                     ]}
                     onPress={() => {
                       if (!isReordering && index < draftChannels.length - 1) {
                         console.log('Moving channel from index', index, 'to index', index + 1);
                         handleReorder(index, index + 1);
                       }
                     }}
                     disabled={index === draftChannels.length - 1 || isReordering}
                     activeOpacity={0.7}
                   >
                     <Icon name="chevron-down" size={20} color={(index === draftChannels.length - 1 || isReordering) ? "#666" : "#fff"} />
                    </TouchableOpacity>
                  </View>
                )}
            </>
          ) : null}
        </View>
      </View>
    );
  }, [handleUnsubscribe, channels.length, isEditMode]);

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
        : 'Tap the shuffle icon to control which channels appear in your mix feed.'
    });
    
    // Use draft channels when in edit mode, otherwise use regular channels
    const displayChannels = isEditMode ? draftChannels : channels;
    
    // Subscribed channels
    displayChannels.forEach((channel, index) => {
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
  }, [channels, draftChannels, availableDefaults, isEditMode]);

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
          onPress={() => {
            if (isEditMode) {
              Alert.alert(
                'Discard Changes',
                'You have unsaved changes. Are you sure you want to discard them?',
                [
                  {
                    text: 'Cancel',
                    style: 'cancel'
                  },
                  {
                    text: 'Discard',
                    style: 'destructive',
                    onPress: () => {
                      setDraftChannels([]);
                      setIsEditMode(false);
                      navigation.goBack();
                    }
                  }
                ]
              );
            } else {
              navigation.goBack();
            }
          }}
          activeOpacity={0.7}
        >
          <Icon name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Manage Channels</Text>
        <TouchableOpacity 
          style={[styles.editButton, isEditMode && styles.editButtonActive]}
          onPress={() => {
            if (isEditMode) {
              // Save changes when Done is pressed
              handleSaveChanges();
            } else {
              // Initialize draft when Edit is pressed
              setDraftChannels([...channels]);
              setIsEditMode(true);
            }
          }}
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
    backgroundColor: '#1C1C1E',
    borderColor: '#333',
  },
  editButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Firma-SemiBold',
  },
  editButtonTextActive: {
    color: '#4CAF50',
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
    marginBottom: 2,
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
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FE4359',
  },
  reorderButtons: {
    flexDirection: 'column',
    gap: 4,
  },
  reorderButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderButtonDisabled: {
    backgroundColor: 'transparent',
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
  mixIconButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  mixButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  deleteButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#FE4359',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
});

export default ChannelManagementScreen; 