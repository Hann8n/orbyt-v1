import React, { memo, useCallback, useMemo, useState } from 'react';
import { BORDER_RADIUS } from '../../../utils/constants';
import { View, StyleSheet, TouchableOpacity, Text, Alert } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useRouter } from 'expo-router';
import UniversalHeader, { HeaderContent, CustomActionLayout } from './UniversalHeader';
import HeaderSkeleton from './HeaderSkeleton';
import { useChannelColors } from '../../../services/cache/ChannelCache';
import Icon, { PlusIcon, CheckIcon, ListViewIcon, GridViewIcon, Loading3FillIcon } from '../../ui/Icon';
import { hexToRGBA, darkenColor } from '../../../utils/formatting/colorUtils';
import { Colors } from '../../ui/UI';
import { useSubscribedChannels } from '../../../hooks/useSubscribedChannels';
 


interface ChannelData {
  id: string;
  uri?: string;
  name: string;
  description?: string;
  avatar?: string;
  likeCount?: number;
  isSubscribed?: boolean;
  isOwner?: boolean;
  isExperimental?: boolean; // Added for experimental feed indicator
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
  onEdit?: (channelId: string) => void;
  onDelete?: (channelId: string) => void;
  children?: React.ReactNode;
  applySafeArea?: boolean;
  headerStyle?: any;
  viewMode?: 'list' | 'grid' | 'horizontal';
  onViewModeChange?: (mode: 'list' | 'grid' | 'horizontal') => void;
  showViewToggle?: boolean;
}



// Subscribe button component
const SubscribeButton: React.FC<{
  channel: ChannelData;
  textColor: string;
  backgroundColor: string;
  accentColor: string;
  viewMode?: 'list' | 'grid' | 'horizontal';
  onViewModeChange?: (mode: 'list' | 'grid' | 'horizontal') => void;
  showViewToggle?: boolean;
}> = ({ channel, textColor, backgroundColor, accentColor, viewMode = 'list', onViewModeChange, showViewToggle = false }) => {
  const { subscribedChannels, subscribeToChannel, unsubscribeFromChannel } = useSubscribedChannels();
  const [isSubscribing, setIsSubscribing] = useState(false);

  // Direct subscription check - simplest possible
  const isSubscribed = useMemo(() => {
    if (!channel?.uri) return false;
    return subscribedChannels.some(ch => ch.uri === channel.uri);
  }, [subscribedChannels, channel?.uri]);

  const handleSubscribe = useCallback(async () => {
    try {
      if (!channel?.uri) return;

      // Show warning for experimental feeds
      if (channel.isExperimental && !isSubscribed) {
        // Try to show alert, but fallback to direct subscription if Alert fails
        let alertShown = false;
        try {
          Alert.alert(
            'Experimental Feed',
            'This feed is not designed for orbyt, and may result in poor performance.\n\nAre you sure you want to subscribe?',
            [
              {
                text: 'Cancel',
                style: 'cancel',
              },
              {
                text: 'Subscribe',
                onPress: async () => {
                  try {
                    setIsSubscribing(true);
                    await subscribeToChannel({
                      uri: channel.uri!,
                      displayName: channel.name,
                      description: channel.description,
                      avatar: channel.avatar,
                      memberCount: channel.likeCount,
                    });
                  } catch (error) {
                  } finally {
                    setIsSubscribing(false);
                  }
                },
              },
            ]
          );
          alertShown = true;
        } catch (error) {
          alertShown = false;
        }
        
        // If alert failed to show, subscribe directly
        if (!alertShown) {
          try {
            setIsSubscribing(true);
            await subscribeToChannel({
              uri: channel.uri!,
              displayName: channel.name,
              description: channel.description,
              avatar: channel.avatar,
              memberCount: channel.likeCount,
            });
          } catch (subscribeError) {
          } finally {
            setIsSubscribing(false);
          }
        }
        return;
      }

      try {
        setIsSubscribing(true);
        
        if (isSubscribed) {
          await unsubscribeFromChannel(channel.uri!);
        } else {
          await subscribeToChannel({
            uri: channel.uri!,
            displayName: channel.name,
            description: channel.description,
            avatar: channel.avatar,
            memberCount: channel.likeCount,
          });
        }
      } catch (error) {
      } finally {
        setIsSubscribing(false);
      }
    } catch (error) {
      setIsSubscribing(false);
    }
  }, [channel, isSubscribed, subscribeToChannel, unsubscribeFromChannel]);

  if (channel.isOwner) return null; // Don't show subscribe button for owners

  const useGlass = isLiquidGlassAvailable();
  const glassTint = isSubscribed ? hexToRGBA(textColor, 1) : hexToRGBA('#FFFFFF', 0.08);

  return (
    <View style={styles.subscribeContainer}>
      <TouchableOpacity
        onPress={handleSubscribe}
        disabled={isSubscribing}
        activeOpacity={0.8}
        style={{ flex: 1, height: 40 }}
      >
        <View
          style={[
            styles.subscribeButton,
            { flex: 1 },
            useGlass
              ? { backgroundColor: 'transparent', borderColor: 'transparent' }
              : {
                  backgroundColor: isSubscribed ? textColor : 'rgba(255, 255, 255, 0.2)',
                  borderColor: isSubscribed ? textColor : 'rgba(255, 255, 255, 0.4)',
                },
          ]}
        >
          {useGlass && (
            <GlassView
              style={styles.glassBackgroundFull}
              glassEffectStyle="clear"
              tintColor={glassTint}
              isInteractive
            />
          )}
          {isSubscribing ? (
            <Loading3FillIcon size={24} color={isSubscribed ? backgroundColor : '#FFFFFF'} />
          ) : (
            <>
              <Text style={[styles.subscribeButtonText, { color: isSubscribed ? backgroundColor : '#FFFFFF' }]}>
                {isSubscribed ? 'Subscribed' : 'Subscribe'}
              </Text>
              {isSubscribed ? (
                <CheckIcon 
                  size={16} 
                  color={backgroundColor} 
                  strokeWidth={2.0}
                />
              ) : (
                <PlusIcon 
                  size={12} 
                  color="#FFFFFF" 
                  strokeWidth={2.0}
                />
              )}
            </>
          )}
        </View>
      </TouchableOpacity>
      
      {showViewToggle && onViewModeChange && (
        <View style={styles.viewToggleContainer}>
          <TouchableOpacity
            onPress={() => onViewModeChange('grid')}
            style={styles.viewToggleButton}
            activeOpacity={0.7}
          >
            <GridViewIcon 
              color={viewMode === 'grid' ? textColor : hexToRGBA(textColor, 0.6)} 
              size={20}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onViewModeChange('list')}
            style={styles.viewToggleButton}
            activeOpacity={0.7}
          >
            <ListViewIcon 
              color={viewMode === 'list' ? textColor : hexToRGBA(textColor, 0.6)} 
              size={20}
            />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const ChannelHeader: React.FC<ChannelHeaderProps> = ({
  channel,
  showBackButton = false,
  onBackPress,
  onEdit,
  onDelete,
  children,
  applySafeArea = false,
  headerStyle,
  viewMode = 'list',
  onViewModeChange,
  showViewToggle = false,
}) => {
  const navigation = useRouter();

  // Get channel colors from cache
  const { colors: channelColors } = useChannelColors(channel?.id || channel?.uri);

  // Ensure text color is always light for better readability on gradients
  const safeTextColor = useMemo(() => {
    // Force light text for channels to ensure readability on gradient backgrounds
    return '#FFFFFF';
  }, []);

  // Ensure background color is properly contrasted and always darker
  const safeBackgroundColor = useMemo(() => {
    const bgColor = channelColors.backgroundColor || '#000000';
    // Calculate brightness
    const brightness = (() => {
      const color = bgColor.replace('#', '');
      const r = parseInt(color.substring(0, 2), 16);
      const g = parseInt(color.substring(2, 4), 16);
      const b = parseInt(color.substring(4, 6), 16);
      return (r * 299 + g * 587 + b * 114) / 1000;
    })();
    
    // If brightness is above 80, darken it further
    if (brightness > 80) {
      return darkenColor(bgColor, 0.3);
    }
    return bgColor;
  }, [channelColors.backgroundColor]);

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

  // Create custom action layouts (only for owner actions now)
  const customActions = useMemo((): CustomActionLayout[] => {
    const actions: CustomActionLayout[] = [];

    // Owner actions: Edit and Delete
    if (channel && channel.isOwner) {
      actions.push({
        type: 'button' as const,
        buttons: [
          {
            id: 'delete',
            label: 'Delete',
            icon: 'trash',
            onPress: handleDelete,
            variant: 'danger' as const,
          },
        ],
      });
    }

    return actions;
  }, [channel, handleEdit, handleDelete]);

  // Create header content
  const headerContent = useMemo((): HeaderContent => {
    if (!channel) {
      return {
        title: '',
        subtitle: '',
      };
    }

    const handleCreatorPress = channel.creator?.handle ? () => {
      const clean = channel.creator!.handle.trim();
      if (!clean) return;
      navigation.push(`/profile/${clean}`);
    } : undefined;

    // Create experimental badge if channel is experimental
    const experimentalBadge = channel.isExperimental ? (
      <Icon name="bug" size={18} color={Colors.lightGreen} style={styles.experimentalIcon} />
    ) : undefined;



    return {
      avatar: channel.avatar,
      title: channel.name,
      subtitle: channel.creator?.handle ? channel.creator.handle : undefined,
      description: channel.description,
      badge: experimentalBadge,
      avatarStyle: 'rounded-square' as const,
      onTitlePress: handleCreatorPress,
    };
  }, [channel, navigation]);

  // Create skeleton component
  const skeleton = useMemo(() => (
    <HeaderSkeleton
      textColor={safeTextColor}
      backgroundColor={safeBackgroundColor}
      showAvatar={true}
      showDescription={true}
      avatarStyle="rounded-square"
    />
  ), [safeTextColor, safeBackgroundColor]);

  // Create children with subscribe button and other content
  const headerChildren = useMemo(() => (
    <>
      {channel && (
        <SubscribeButton
          channel={channel}
          textColor={safeTextColor}
          backgroundColor={safeBackgroundColor}
          accentColor={channelColors.accentColor || '#000000'}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          showViewToggle={showViewToggle}
        />
      )}
      {children}
    </>
  ), [channel, safeTextColor, safeBackgroundColor, children, channelColors.accentColor, showViewToggle, onViewModeChange, viewMode]);

  return (
    <UniversalHeader
      content={headerContent}
      actions={[]} // Hide default actions, use custom layout
      customActions={customActions}
      showBackButton={showBackButton}
      onBackPress={onBackPress}
      backgroundColor={safeBackgroundColor}
      textColor={safeTextColor}
      isLoading={!channel}
      skeleton={skeleton}
      // Removed showGradient and gradientType as they don't exist on UniversalHeaderProps
      applySafeArea={applySafeArea}
      style={{ opacity: 1 }}
      contentStyle={[headerStyle]}
    >
      {headerChildren}
    </UniversalHeader>
  );
};

const styles = StyleSheet.create({
  subscribeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginTop: 12,
    marginBottom: 20,
    width: '100%',
  },
  subscribeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 0,
    borderColor: 'transparent',
    gap: 6,
  },
  glassBackgroundFull: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
  },
  subscribeButtonText: {
    fontFamily: 'Firma-Bold',
    fontSize: 15,
    fontWeight: '600',
  },

  likeCountContainer: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginLeft: 4,
  },
  likeCountNumber: {
    fontFamily: 'Firma-Bold',
    fontSize: 14,
    fontWeight: 'bold',
  },
  likeCountLabel: {
    fontFamily: 'Firma-SemiBold',
    fontSize: 14,
    marginTop: 2,
  },
  viewToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 8,
  },
  viewToggleButton: {
    padding: 6,
    borderRadius: BORDER_RADIUS.FULL,
  },
  experimentalIcon: {
    marginLeft: 6,
    alignSelf: 'center',
    marginTop: 2,
  },
});

export default memo(ChannelHeader); 