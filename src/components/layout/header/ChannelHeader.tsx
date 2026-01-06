import React, { memo, useCallback, useMemo, useState } from 'react';
import { BORDER_RADIUS } from '../../../utils/constants';
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  Alert,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useRouter } from 'expo-router';
import UniversalHeader, { HeaderContent, CustomActionLayout } from './UniversalHeader';
import { useChannelColors } from '../../../services/data/ChannelService';
import Icon, {
  PlusIcon,
  CheckIcon,
  ListViewIcon,
  GridViewIcon,
  Loading3FillIcon,
} from '../../ui/Icon';
import type { ViewMode } from '../../../types';
import {
  hexToRGBA,
  darkenColor,
  getStatusBarStyle,
  isColorDark,
} from '../../../utils/formatting/colors';
import { Colors } from '../../ui/UI';
import { useSubscribedChannels } from '../../../hooks/useSubscribedChannels';
import {
  isOrbytChannel,
  getChannelByUri,
  shouldShowChannelSlash,
} from '../../../utils/channels/orbyt';
import { RichText } from '@atproto/api';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';

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
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  showViewToggle?: boolean;
  headerScrollProgress?: SharedValue<number>;
  contentFadeDisabled?: boolean;
  dimOverlayDisabled?: boolean;
}

// Subscribe button component
const SubscribeButton: React.FC<{
  channel: ChannelData;
  textColor: string;
  backgroundColor: string;
  accentColor: string;
  channelColor?: string;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  showViewToggle?: boolean;
  containerStyle?: any;
}> = ({
  channel,
  textColor,
  backgroundColor,
  accentColor,
  channelColor,
  viewMode = 'list',
  onViewModeChange,
  showViewToggle = false,
  containerStyle,
}) => {
  const { subscribedChannels, subscribeToChannel, unsubscribeFromChannel } =
    useSubscribedChannels();
  const [isSubscribing, setIsSubscribing] = useState(false);
  const { width: screenWidth } = useWindowDimensions();
  const isWideScreen = screenWidth > 768;

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
  // Use channelColor for channels, fallback to textColor
  const subscribeColor = channelColor || textColor;
  const glassTint = isSubscribed ? hexToRGBA(subscribeColor, 1) : hexToRGBA('#FFFFFF', 0.08);

  // Calculate appropriate text color for subscribed state based on background brightness
  const subscribedTextColor = useMemo(() => {
    if (!isSubscribed) return '#FFFFFF';
    // Use white text for dark backgrounds, black for light backgrounds
    return isColorDark(subscribeColor) ? '#FFFFFF' : '#000000';
  }, [isSubscribed, subscribeColor]);

  return (
    <View style={[styles.subscribeContainer, containerStyle]}>
      <Pressable
        onPress={handleSubscribe}
        disabled={isSubscribing}
        style={[styles.subscribeButtonTouch, isWideScreen && styles.subscribeButtonMax]}
      >
        <View
          style={[
            styles.subscribeButton,
            { flex: 1 },
            useGlass
              ? { backgroundColor: 'transparent', borderColor: 'transparent', borderWidth: 0 }
              : {
                  backgroundColor: isSubscribed ? subscribeColor : 'rgba(255, 255, 255, 0.2)',
                  borderColor: 'transparent',
                  borderWidth: 0,
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
          <View
            pointerEvents="none"
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            {isSubscribing ? (
              <Loading3FillIcon size={24} color={isSubscribed ? subscribedTextColor : '#FFFFFF'} />
            ) : (
              <>
                <Text
                  style={[
                    styles.subscribeButtonText,
                    { color: isSubscribed ? subscribedTextColor : '#FFFFFF' },
                  ]}
                >
                  {isSubscribed ? 'Subscribed' : 'Subscribe'}
                </Text>
                {isSubscribed ? (
                  <CheckIcon size={16} color={subscribedTextColor} strokeWidth={2.0} />
                ) : (
                  <PlusIcon size={12} color="#FFFFFF" strokeWidth={2.0} />
                )}
              </>
            )}
          </View>
        </View>
      </Pressable>

      {showViewToggle && onViewModeChange && (
        <View style={styles.viewToggleContainer}>
          <Pressable onPress={() => onViewModeChange('grid')} style={styles.viewToggleButton}>
            <GridViewIcon
              color={viewMode === 'grid' ? textColor : hexToRGBA(textColor, 0.6)}
              size={20}
            />
          </Pressable>
          <Pressable onPress={() => onViewModeChange('list')} style={styles.viewToggleButton}>
            <ListViewIcon
              color={viewMode === 'list' ? textColor : hexToRGBA(textColor, 0.6)}
              size={20}
            />
          </Pressable>
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
  headerScrollProgress,
  contentFadeDisabled = false,
  dimOverlayDisabled = false,
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

  // Check if this is an Orbyt channel
  const isOrbyt = useMemo(() => {
    return channel?.uri ? isOrbytChannel(channel.uri) : false;
  }, [channel?.uri]);

  // Create header content
  const headerContent = useMemo((): HeaderContent => {
    if (!channel) {
      return {
        title: '',
        subtitle: '',
      };
    }

    const handleCreatorPress = channel.creator?.handle
      ? () => {
          const clean = channel.creator!.handle.trim();
          if (!clean) return;
          navigation.push(`/profile/${clean}`);
        }
      : undefined;

    // Create experimental badge if channel is experimental
    const experimentalBadge = channel.isExperimental ? (
      <Icon name="bug" size={18} color={Colors.lightGreen} style={styles.experimentalIcon} />
    ) : undefined;

    // Get Orbyt channel info for custom title
    const orbytChannel = isOrbyt && channel.uri ? getChannelByUri(channel.uri) : undefined;
    const channelColor = orbytChannel?.channelColor || '#FFD700';

    const customTitle = isOrbyt ? (
      <View style={styles.orbytChannelTitle}>
        {shouldShowChannelSlash(channel.uri || '') && (
          <Text style={[styles.title, styles.orbytSlash, { color: channelColor }]}>/</Text>
        )}
        <Text style={[styles.title, { color: safeTextColor }]}>{channel.name}</Text>
      </View>
    ) : undefined;

    // Parse description to generate rich text facets
    const richText = channel.description
      ? (() => {
          const rt = new RichText({ text: channel.description });
          rt.detectFacetsWithoutResolution();
          return rt;
        })()
      : null;

    return {
      avatar: channel.avatar,
      title: channel.name,
      customTitle: customTitle,
      subtitle: isOrbyt ? undefined : channel.creator?.handle ? channel.creator.handle : undefined,
      description: richText?.text,
      facets: richText?.facets,
      badge: experimentalBadge,
      avatarStyle: 'rounded-square' as const,
      onTitlePress: handleCreatorPress,
      hideAvatar: isOrbyt,
    };
  }, [channel, navigation, safeTextColor, isOrbyt]);

  // Determine status bar style based on background color brightness
  const statusBarStyle = useMemo(() => {
    const style = getStatusBarStyle(safeBackgroundColor);
    return style === 'light' ? 'light-content' : 'dark-content';
  }, [safeBackgroundColor]);

  // Check if this is a category channel (hashtag feed) - postable Orbyt channels have tabs
  const hasTabs = useMemo(() => {
    if (!isOrbyt || !channel?.uri) return false;
    const orbytChannel = getChannelByUri(channel.uri);
    return orbytChannel?.isPostable !== false; // Default to true, only false for non-postable channels
  }, [isOrbyt, channel?.uri]);

  // Animated styles driven by shared scroll progress (0 -> 1)
  const headerAnimatedStyle = useAnimatedStyle(() => {
    // Keep container fully opaque; inner UniversalHeader handles content fade
    return { opacity: 1 };
  }, []);

  const dimOverlayStyle = useAnimatedStyle(() => {
    const progress = headerScrollProgress?.value ?? 0;
    if (dimOverlayDisabled) {
      return { ...StyleSheet.absoluteFillObject, opacity: 0, pointerEvents: 'none' } as any;
    }
    // More gradual dim: start dimming at 40% progress, reach ~30% black opacity at max scroll
    const overlayOpacity = interpolate(progress, [0, 0.4, 1], [0, 0, 0.3], Extrapolate.CLAMP);
    return {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'black',
      opacity: overlayOpacity,
      pointerEvents: 'none',
    } as any;
  }, [headerScrollProgress, dimOverlayDisabled]);

  // Create children with subscribe button and other content
  const headerChildren = useMemo(
    () => (
      <>
        {channel && (
          <SubscribeButton
            channel={channel}
            textColor={safeTextColor}
            backgroundColor={safeBackgroundColor}
            accentColor={channelColors.accentColor || '#000000'}
            channelColor={
              isOrbyt && channel.uri ? getChannelByUri(channel.uri)?.channelColor : undefined
            }
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
            showViewToggle={showViewToggle}
            containerStyle={hasTabs ? styles.subscribeContainerWithTabs : undefined}
          />
        )}
        {children}
      </>
    ),
    [
      channel,
      safeTextColor,
      safeBackgroundColor,
      children,
      channelColors.accentColor,
      showViewToggle,
      onViewModeChange,
      viewMode,
      isOrbyt,
      hasTabs,
    ]
  );

  // For Orbyt channels, use channelGIF as primary avatar/background, fallback to avatar
  // Memoize to prevent flickering when feed changes
  const backgroundImage = useMemo(() => {
    if (!isOrbyt || !channel?.uri) return undefined;

    // Get Orbyt channel config to check for channelGIF
    const orbytChannel = getChannelByUri(channel.uri);
    if (orbytChannel?.channelGIF) {
      // Convert require() result to URI using Asset.resolveAsync or direct require
      // expo-image can handle require() directly, but for URI we use Asset
      const { Asset } = require('expo-asset');
      const resolvedAsset = Asset.fromModule(orbytChannel.channelGIF);
      const uri = resolvedAsset.localUri || resolvedAsset.uri;
      return uri;
    }

    // Fallback to regular avatar if no channelGIF
    return channel.avatar;
  }, [isOrbyt, channel?.uri, channel?.avatar]);

  return (
    <>
      <StatusBar
        barStyle={statusBarStyle}
        backgroundColor={safeBackgroundColor}
        translucent={true}
      />
      <Animated.View style={headerAnimatedStyle}>
        <UniversalHeader
          content={headerContent}
          actions={[]} // Hide default actions, use custom layout
          customActions={customActions}
          showBackButton={showBackButton}
          onBackPress={onBackPress}
          backgroundColor={safeBackgroundColor}
          textColor={safeTextColor}
          backgroundImage={backgroundImage}
          isLoading={false}
          applySafeArea={applySafeArea}
          reserveTopForOverlayButtons={true}
          style={{ opacity: 1 }}
          contentStyle={[headerStyle]}
          minHeight={isOrbyt ? 450 : undefined}
          contentPosition={isOrbyt ? 'bottom' : 'top'}
          hasTabs={hasTabs}
          contentScrollProgress={contentFadeDisabled ? undefined : headerScrollProgress}
        >
          {headerChildren}
        </UniversalHeader>
        {/* Dim overlay above background as user scrolls */}
        <Animated.View style={dimOverlayStyle} />
      </Animated.View>
    </>
  );
};

const styles = StyleSheet.create({
  subscribeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
    marginTop: 12,
    marginBottom: 20,
    width: '100%',
  },
  subscribeButtonTouch: {
    flex: 1,
    height: 40,
  },
  subscribeButtonMax: {
    maxWidth: 400,
  },
  subscribeContainerWithTabs: {
    marginBottom: 0, // Reduced spacing when tabs are present
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
    justifyContent: 'flex-end',
    flexShrink: 0,
    gap: 4,
    marginLeft: 12,
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
  orbytChannelTitle: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
  title: {
    fontFamily: 'Firma-Black',
    fontWeight: 'bold',
    fontSize: 28,
    flexShrink: 1,
  },
  orbytSlash: {
    fontFamily: 'Firma-SemiBold',
    marginRight: 0,
  },
});

export default memo(ChannelHeader);
