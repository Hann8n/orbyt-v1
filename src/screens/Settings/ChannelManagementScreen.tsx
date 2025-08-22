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
import ListHeader from '../../components/ui/ListHeader';
import { Avatar, Icon } from '../../components/ui/UI';
import { Colors } from '../../components/ui/UI';
import { BackArrowIcon, PlusIcon } from '../../components/ui/Icon';
import { useSubscribedChannels } from '../../hooks/useSubscribedChannels';
import { SubscribedChannel } from '../../services/storage/ChannelSubscriptionManager';
import AtprotoService from '../../services/api/AtprotoService';
import { formatNumber } from '../../utils/helpers/formatNumber';
import { settingsButtonStyles, settingsTextStyles, settingsLayoutStyles } from './SettingsStyles';

type ListItem = 
  | { type: 'channel'; channel: SubscribedChannel; index: number }
  | { type: 'available-header'; title: string; description: string }
  | { type: 'available-channel'; channel: SubscribedChannel };

const ChannelManagementScreen: React.FC = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [availableDefaults, setAvailableDefaults] = useState<SubscribedChannel[]>([]);
  const { 
    channels, 
    isLoading, 
    refetch, 
    restoreDefaultChannel,
    getAvailableDefaultChannels,
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
    return (
      <TouchableOpacity
        style={settingsButtonStyles.menuOption}
        onPress={() => {
          // Navigate to the channel
          (navigation as any).navigate('Channel', {
            uri: channel.uri,
            title: channel.displayName,
            description: channel.description,
            avatar: channel.avatar
          });
        }}
        activeOpacity={0.7}
      >
        <View style={styles.channelInfo}>
          <View style={styles.avatarContainer}>
            <Avatar
              uri={channel.avatar}
              type="channel"
              size={44}
            />
          </View>
          
          <View style={styles.channelDetails}>
            <Text style={[settingsTextStyles.menuOptionText, { fontFamily: 'Firma-Bold' }]}>
              {channel.displayName}
            </Text>
            {channel.description && (
              <Text style={settingsTextStyles.menuOptionSubtitle} numberOfLines={2}>
                {channel.description}
              </Text>
            )}
          </View>
        </View>
        
        <Icon name="right_arrow_filled" size={24} color={Colors.lightGray} />
      </TouchableOpacity>
    );
  }, [navigation]);

  const renderAvailableChannelItem = useCallback(({ item: channel }: { item: SubscribedChannel }) => (
    <View style={settingsButtonStyles.menuOption}>
      <View style={styles.channelInfo}>
        <View style={styles.avatarContainer}>
          <Avatar
            uri={channel.avatar}
            type="channel"
            size={44}
          />
        </View>
        <View style={styles.channelDetails}>
          <Text style={settingsTextStyles.menuOptionText}>{channel.displayName}</Text>
          <Text style={settingsTextStyles.menuOptionSubtitle}>Default channel</Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.restoreButton}
        onPress={() => handleRestoreDefault(channel)}
        activeOpacity={0.7}
      >
        <PlusIcon size={16} color={Colors.lightGreen} strokeWidth={2.0} />
      </TouchableOpacity>
    </View>
  ), [handleRestoreDefault]);

  const renderHeaderItem = useCallback(({ item }: { item: { title: string; description: string } }) => (
    <View style={settingsLayoutStyles.section}>
      <Text style={settingsTextStyles.sectionTitleLarge}>{item.title}</Text>
      <Text style={settingsTextStyles.sectionDescription}>{item.description}</Text>
    </View>
  ), []);

  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    switch (item.type) {
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
    
    // Filter out built-in feeds and only show user-subscribed channels
    const userChannels = channels.filter(channel => !['following', 'yourMix'].includes(channel.uri));
    
    // Subscribed channels
    userChannels.forEach((channel, index) => {
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
  }, [channels, availableDefaults]);

  const keyExtractor = useCallback((item: ListItem, index: number) => {
    switch (item.type) {
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
      <View style={settingsLayoutStyles.container}> 
        <ListHeader
          mode="stacked"
          title="channels"
          showBackButton
          onBackPress={() => navigation.goBack()}
          applySafeAreaTop
        />
        
        <View style={settingsLayoutStyles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.white} />
          <Text style={settingsTextStyles.loadingText}>loading channels...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={settingsLayoutStyles.container}> 
              <ListHeader
          mode="stacked"
          title="channels"
          showBackButton
          onBackPress={() => navigation.goBack()}
          applySafeAreaTop
        />

      {/* Content */}
      <FlatList
        data={getListData()}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={settingsLayoutStyles.contentContainerWithPadding}
        ItemSeparatorComponent={() => <View style={settingsLayoutStyles.separator} />}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  channelInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatarContainer: {
    marginRight: 12,
    marginTop: 2,
  },
  channelDetails: {
    flex: 1,
  },
  restoreButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.darkGray,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.lightGreen,
  },
});

export default ChannelManagementScreen; 