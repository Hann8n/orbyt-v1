import React, { useMemo, useCallback, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import UniversalHeader, { HeaderAction, HeaderContent, CustomActionLayout } from './UniversalHeader';
import HeaderSkeleton from './HeaderSkeleton';
import { useChannelColors } from '../../../services/cache/ChannelCache';
import Icon from '../../ui/Icon';
import { hexToRGBA } from '../../../utils/formatting/colorUtils';
import { Avatar } from '../../ui/UI';
import { HomeStackParamList } from '../../../navigation/types';
import { useProfile } from '../../../services/cache/ProfileCache';
import VerificationBadge from '../../features/verification/VerificationBadge';
import { UI } from '../../../utils/formatting/Colors';

interface ChannelData {
  id: string;
  name: string;
  description?: string;
  avatar?: string;
  memberCount?: number;
  isSubscribed?: boolean;
  isOwner?: boolean;
  creator?: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
}

interface ChannelHeaderProps {
  channel: ChannelData | null;
  showBackButton?: boolean;
  onBackPress?: () => void;
  onSubscribe?: (channelId: string, subscribe: boolean) => Promise<void>;
  onEdit?: (channelId: string) => void;
  onDelete?: (channelId: string) => void;
  children?: React.ReactNode;
}

// Creator information component
const CreatorInfo: React.FC<{
  creator: ChannelData['creator'];
  textColor: string;
  backgroundColor: string;
}> = ({ creator, textColor, backgroundColor }) => {
  const navigation = useNavigation<any>();

  if (!creator) return null;

  // Use ProfileCache to get full creator profile data
  const { data: creatorProfile } = useProfile(creator.handle);

  const handleCreatorPress = useCallback(() => {
    if (creator.handle) {
      navigation.navigate('AuthorProfile', { handle: creator.handle });
    }
  }, [creator.handle, navigation]);

  // Use cached profile data if available, otherwise fall back to channel creator data
  const displayName = creatorProfile?.displayName || creator.displayName || creator.handle || 'Unknown';
  const avatar = creatorProfile?.avatar || creator.avatar;
  const handle = creatorProfile?.handle || creator.handle;

  return (
    <TouchableOpacity
      style={styles.creatorContainer}
      onPress={handleCreatorPress}
      activeOpacity={0.7}
    >
      <View style={styles.creatorContent}>
        <Avatar
          uri={avatar}
          type="profile"
          size={40}
          style={styles.creatorAvatar}
        />
        <View style={styles.creatorTextContainer}>
          <View style={styles.creatorNameRow}>
            <Text style={[styles.creatorName, { color: textColor }]}>
              {displayName}
            </Text>
            {handle && (
              <VerificationBadge
                handle={handle}
                size={12}
                style={styles.verificationBadge}
                textColor={textColor}
              />
            )}
          </View>
          <Text style={[styles.creatorHandle, { color: hexToRGBA(textColor, 0.67) }]}>
            @{handle}
          </Text>
        </View>
      </View>
      <Icon name="chevron-right" size={16} color={hexToRGBA(textColor, 0.5)} />
    </TouchableOpacity>
  );
};

const ChannelHeader: React.FC<ChannelHeaderProps> = ({
  channel,
  showBackButton = false,
  onBackPress,
  onSubscribe,
  onEdit,
  onDelete,
  children,
}) => {
  const navigation = useNavigation();
  const [isSubscribing, setIsSubscribing] = useState(false);

  // Get channel colors from cache
  const { colors: channelColors } = useChannelColors(channel?.id);

  // Handle subscribe/unsubscribe action
  const handleSubscribe = useCallback(async () => {
    if (!channel?.id || !onSubscribe) return;

    try {
      setIsSubscribing(true);
      const isCurrentlySubscribed = !!channel.isSubscribed;
      await onSubscribe(channel.id, !isCurrentlySubscribed);
    } catch (error) {
      console.error('Error during subscribe/unsubscribe:', error);
    } finally {
      setIsSubscribing(false);
    }
  }, [channel, onSubscribe]);

  // Handle edit action
  const handleEdit = useCallback(() => {
    if (channel?.id && onEdit) {
      onEdit(channel.id);
    }
  }, [channel, onEdit]);

  // Handle delete action
  const handleDelete = useCallback(() => {
    if (channel?.id && onDelete) {
      onDelete(channel.id);
    }
  }, [channel, onDelete]);

  // Create custom action layouts
  const customActions = useMemo((): CustomActionLayout[] => {
    if (!channel) return [];

    if (channel.isOwner) {
      // Owner actions: Edit and Delete
      return [
        {
          type: 'button',
          buttons: [
            {
              id: 'edit',
              label: 'Edit',
              icon: 'edit',
              onPress: handleEdit,
            },
            {
              id: 'delete',
              label: 'Delete',
              icon: 'trash',
              onPress: handleDelete,
              variant: 'danger' as const,
            },
          ],
        },
      ];
    } else {
      // Non-owner: Subscribe button
      return [
        {
          type: 'button',
          buttons: [
            {
              id: 'subscribe',
              label: channel.isSubscribed ? 'Subscribed' : 'Subscribe',
              icon: channel.isSubscribed ? 'check' : 'plus',
              onPress: handleSubscribe,
              disabled: isSubscribing,
              loading: isSubscribing,
            },
          ],
        },
      ];
    }
  }, [channel, isSubscribing, handleSubscribe, handleEdit, handleDelete]);

  // Create header content
  const headerContent = useMemo((): HeaderContent => {
    if (!channel) {
      return {
        title: 'Loading...',
        subtitle: 'Loading channel...',
      };
    }

    return {
      avatar: channel.avatar,
      title: channel.name,
      subtitle: channel.memberCount ? `${channel.memberCount} members` : undefined,
      description: channel.description,
      avatarStyle: 'rounded-square' as const,
    };
  }, [channel]);

  // Create skeleton component
  const skeleton = useMemo(() => (
    <HeaderSkeleton
      textColor={channelColors.textColor}
      showAvatar={true}
      showDescription={true}
      avatarStyle="rounded-square"
    />
  ), [channelColors.textColor]);

  return (
    <UniversalHeader
      content={headerContent}
      actions={[]} // Hide default actions, use custom layout
      customActions={customActions}
      showBackButton={showBackButton}
      onBackPress={onBackPress}
      backgroundColor={channelColors.backgroundColor}
      textColor={channelColors.textColor}
      isLoading={!channel}
      skeleton={skeleton}
    >
      {channel?.creator && (
        <CreatorInfo
          creator={channel.creator}
          textColor={channelColors.textColor}
          backgroundColor={channelColors.backgroundColor}
        />
      )}
      {children}
    </UniversalHeader>
  );
};

const styles = StyleSheet.create({
  creatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  creatorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  creatorAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    borderWidth: 1,
    borderColor: UI.BORDER.PRIMARY,
  },
  creatorTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  creatorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  creatorName: {
    fontSize: 14,
    fontFamily: 'Firma-SemiBold',
    marginBottom: 2,
  },
  creatorHandle: {
    fontSize: 12,
    fontFamily: 'Firma-Regular',
  },
  verificationBadge: {
    marginLeft: 4,
  },
});

export default ChannelHeader; 