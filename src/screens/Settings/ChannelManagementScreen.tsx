import React, { useState, useEffect, useCallback } from 'react';
import { BORDER_RADIUS } from '../../utils/constants';
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
import { SubscribedChannel } from '../../stores/userStore';
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
        style={styles.channelButton}
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
        <View style={styles.channelButtonContent}>
          <View style={styles.channelAvatarContainer}>
            <Avatar
              uri={channel.avatar}
              type="channel"
              size={50}
              ringColor="transparent"
            />
          </View>
          
          <View style={styles.channelInfoContainer}>
            <Text style={styles.channelDisplayName}>
              {channel.displayName}
            </Text>
            {channel.description && (
              <Text style={styles.channelDescription} numberOfLines={2}>
                {channel.description}
              </Text>
            )}
          </View>
          
          <View style={styles.channelArrowContainer}>
            <Icon name="right_arrow_filled" size={24} color={Colors.lightGray} />
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [navigation]);

  const renderAvailableChannelItem = useCallback(({ item: channel }: { item: SubscribedChannel }) => (
    <View style={styles.channelButton}>
      <View style={styles.channelButtonContent}>
        <View style={styles.channelAvatarContainer}>
          <Avatar
            uri={channel.avatar}
            type="channel"
            size={50}
            ringColor="transparent"
          />
        </View>
        <View style={styles.channelInfoContainer}>
          <Text style={styles.channelDisplayName}>{channel.displayName}</Text>
          <Text style={styles.channelDescription}>Default channel</Text>
        </View>
        <TouchableOpacity
          style={styles.restoreButton}
          onPress={() => handleRestoreDefault(channel)}
          activeOpacity={0.7}
        >
          <PlusIcon size={16} color={Colors.lightGreen} strokeWidth={2.0} />
        </TouchableOpacity>
      </View>
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
          mode="sheet"
          title="channels"
          showCloseButton
          onClosePress={() => navigation.goBack()}
          applySafeAreaTop={false}
          style={{ marginHorizontal: -5 }}
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
          mode="sheet"
          title="channels"
          showCloseButton
          onClosePress={() => navigation.goBack()}
          applySafeAreaTop={false}
          style={{ marginHorizontal: -5 }}
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
  channelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.MEDIUM,
    padding: 16,
    marginBottom: 12,
  },
  channelButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  channelAvatarContainer: {
    marginRight: 12,
  },
  channelInfoContainer: {
    flex: 1,
  },
  channelDisplayName: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Firma-Bold',
    marginBottom: 2,
  },
  channelDescription: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
  },
  channelArrowContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  restoreButton: {
    width: 36,
    height: 36,
    borderRadius: BORDER_RADIUS.MEDIUM,
    backgroundColor: Colors.darkGray,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.lightGreen,
  },
});

export default ChannelManagementScreen; 