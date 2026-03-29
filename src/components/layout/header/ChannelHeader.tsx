import React, { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { BORDER_RADIUS } from '../../../utils/constants';
import {
  View,
  StyleSheet,
  Text,
  StatusBar,
  Platform,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useProfileChannelNavigation } from '@/hooks/useProfileChannelNavigation';
import UniversalHeader, { HeaderContent } from './UniversalHeader';
import { useChannelColors } from '../../../services/data/ChannelService';
import { PlusIcon, CheckIcon, ListViewIcon, GridViewIcon, STROKE_WIDTH_THICK } from '../../ui/Icon';
import { NativePressable } from '../../ui/NativePressable';
import type { ViewMode } from '../../../types';
import {
  hexToRGBA,
  blendColors,
  darkenColor,
  getStatusBarStyle,
  isColorDark,
} from '../../../utils/formatting/colors';
import { Colors } from '../../../theme';
import { useSubscribedChannels } from '../../../hooks/useSubscribedChannels';
import {
  isOrbytChannel,
  getChannelByUri,
  shouldShowChannelSlash,
  getLocalizedChannelDisplayName,
  getLocalizedChannelDescription,
} from '../../../utils/channels/orbyt';
import { RichText } from '@atproto/api';
import type { SharedValue } from 'react-native-reanimated';
interface ChannelData {
  id: string;
  uri?: string;
  name: string;
  description?: string;
  avatar?: string;
  likeCount?: number;
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
  children?: React.ReactNode;
  applySafeArea?: boolean;
  headerStyle?: StyleProp<ViewStyle>;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  showViewToggle?: boolean;
  contentFadeDisabled?: boolean;
  dimOverlayDisabled?: boolean;
  /** Same SharedValue as `contentScrollProgressOutput` on the feed list (matches ProfileHeader). */
  contentScrollProgressSV: SharedValue<number>;
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
  containerStyle?: StyleProp<ViewStyle>;
}> = ({
  channel,
  textColor,
  backgroundColor: _backgroundColor,
  accentColor: _accentColor,
  channelColor,
  viewMode = 'list',
  onViewModeChange,
  showViewToggle = false,
  containerStyle,
}) => {
  const { t } = useTranslation();
  const { subscribedChannels, subscribeToChannel, unsubscribeFromChannel } =
    useSubscribedChannels();
  const { width: screenWidth } = useWindowDimensions();
  const isWideScreen = screenWidth > 768;

  // Direct subscription check - simplest possible (no memo to satisfy React Compiler lint)
  const isSubscribed =
    !!channel?.uri &&
    subscribedChannels.some(subscribedChannel => subscribedChannel.uri === channel.uri);

  const handleSubscribe = useCallback(async () => {
    try {
      if (!channel?.uri) return;

      try {
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
      } catch (_subscribeOrUnsubscribeError) {
        // Swallow errors for optimistic UX; upstream handlers/logging can capture if needed
      }
    } catch (_error) {
      // Ignore outer subscribe errors for optimistic UX; underlying store/logging can handle
    }
  }, [channel, isSubscribed, subscribeToChannel, unsubscribeFromChannel]);

  const hasFilledBackground = isSubscribed;
  const canUseLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();
  const activeFillColor = useMemo(() => channelColor || textColor, [channelColor, textColor]);
  const activeContentColor = useMemo(
    () => (isColorDark(activeFillColor) ? Colors.neutral[50] : Colors.black),
    [activeFillColor]
  );

  const getButtonStyle = useCallback(() => {
    const showFilledState = hasFilledBackground;
    return {
      backgroundColor: canUseLiquidGlass
        ? Colors.transparent
        : showFilledState
          ? activeFillColor
          : blendColors(_backgroundColor, textColor, 0.2),
      borderColor: Colors.transparent,
      borderWidth: 0,
    };
  }, [hasFilledBackground, _backgroundColor, textColor, canUseLiquidGlass, activeFillColor]);

  const getLiquidGlassTintColor = useCallback(() => {
    const activeTint = activeFillColor;
    const inactiveTint = hexToRGBA(Colors.black, 0.12);
    return hasFilledBackground ? activeTint : inactiveTint;
  }, [hasFilledBackground, activeFillColor]);

  const getContentColor = useCallback(() => {
    const showFilledState = hasFilledBackground;
    return showFilledState ? activeContentColor : textColor;
  }, [hasFilledBackground, activeContentColor, textColor]);

  if (channel.isOwner) return null; // Don't show subscribe button for owners

  const subscribePill = (
    <View style={[styles.subscribeButton, styles.subscribeButtonInner, getButtonStyle()]}>
      {canUseLiquidGlass && (
        <GlassView
          style={styles.subscribeButtonGlassBackground}
          glassEffectStyle="clear"
          tintColor={getLiquidGlassTintColor()}
        />
      )}
      <View pointerEvents="none" style={styles.subscribeButtonContent}>
        <Text style={[styles.subscribeButtonText, { color: getContentColor() }]}>
          {isSubscribed ? t('settings.subscribed') : t('settings.subscribe')}
        </Text>
        {isSubscribed ? (
          <CheckIcon size={16} color={getContentColor()} strokeWidth={STROKE_WIDTH_THICK} />
        ) : (
          <PlusIcon size={16} color={getContentColor()} strokeWidth={STROKE_WIDTH_THICK} />
        )}
      </View>
    </View>
  );

  const subscribeTouchStyle = [
    styles.subscribeButtonTouch,
    isWideScreen && styles.subscribeButtonMax,
  ];

  return (
    <View style={[styles.subscribeContainer, containerStyle]}>
      {isSubscribed ? (
        <View style={subscribeTouchStyle}>{subscribePill}</View>
      ) : (
        <NativePressable style={subscribeTouchStyle} onPress={handleSubscribe}>
          {subscribePill}
        </NativePressable>
      )}

      {showViewToggle && onViewModeChange && (
        <View style={styles.viewToggleContainer}>
          <NativePressable
            androidRippleBorderless
            onPress={() => onViewModeChange('grid')}
            style={styles.viewToggleButton}
          >
            <GridViewIcon
              color={viewMode === 'grid' ? textColor : hexToRGBA(textColor, 0.6)}
              size={20}
            />
          </NativePressable>
          <NativePressable
            androidRippleBorderless
            onPress={() => onViewModeChange('list')}
            style={styles.viewToggleButton}
          >
            <ListViewIcon
              color={viewMode === 'list' ? textColor : hexToRGBA(textColor, 0.6)}
              size={20}
            />
          </NativePressable>
        </View>
      )}
    </View>
  );
};

const ChannelHeader: React.FC<ChannelHeaderProps> = ({
  channel,
  children,
  applySafeArea = false,
  headerStyle,
  viewMode = 'list',
  onViewModeChange,
  showViewToggle = false,
  contentFadeDisabled = false,
  dimOverlayDisabled = false,
  contentScrollProgressSV,
}) => {
  const { navigateToProfile: goToProfile } = useProfileChannelNavigation();

  // Get channel colors from cache
  const { colors: channelColors } = useChannelColors(channel?.id || channel?.uri);

  // Ensure text color is always light for better readability on gradients
  const safeTextColor = useMemo(() => {
    // Force light text for channels to ensure readability on gradient backgrounds
    return Colors.neutral[50];
  }, []);

  // Ensure background color is properly contrasted and always darker
  const safeBackgroundColor = useMemo(() => {
    const bgColor = channelColors.backgroundColor || Colors.black;
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

  // Check if this is an orbyt channel
  const isOrbyt = useMemo(() => {
    if (!channel?.uri) {
      return false;
    }
    return isOrbytChannel(channel.uri);
  }, [channel]);

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
          const did = channel.creator!.did?.trim();
          if (!did) return;
          goToProfile(did);
        }
      : undefined;

    // Get orbyt channel info for custom title
    const orbytChannel = isOrbyt && channel.uri ? getChannelByUri(channel.uri) : undefined;
    const channelColor = orbytChannel?.channelColor || Colors.amber[400];
    const displayName =
      getLocalizedChannelDisplayName(channel.uri || '', channel.name) || channel.name;
    const descriptionText =
      getLocalizedChannelDescription(channel.uri || '', channel.description || '') ||
      channel.description ||
      '';

    const customTitle = isOrbyt ? (
      <View style={styles.orbytChannelTitle}>
        {shouldShowChannelSlash(channel.uri || '') && (
          <Text style={[styles.title, styles.orbytSlash, { color: channelColor }]}>/</Text>
        )}
        <Text style={[styles.title, { color: safeTextColor }]}>{displayName}</Text>
      </View>
    ) : undefined;

    // Parse description to generate rich text facets
    const richText = descriptionText
      ? (() => {
          const rt = new RichText({ text: descriptionText });
          rt.detectFacetsWithoutResolution();
          return rt;
        })()
      : null;

    return {
      avatar: channel.avatar,
      title: displayName,
      customTitle: customTitle,
      subtitle: isOrbyt ? undefined : channel.creator?.handle ? channel.creator.handle : undefined,
      description: richText?.text,
      facets: richText?.facets,
      avatarStyle: 'rounded-square' as const,
      onTitlePress: handleCreatorPress,
      hideAvatar: isOrbyt,
    };
  }, [channel, goToProfile, safeTextColor, isOrbyt]);

  // Determine status bar style based on background color brightness
  const statusBarStyle = useMemo(() => {
    const style = getStatusBarStyle(safeBackgroundColor);
    return style === 'light' ? 'light-content' : 'dark-content';
  }, [safeBackgroundColor]);

  // Check if this is a category channel (hashtag feed) - postable orbyt channels have tabs
  const hasTabs = useMemo(() => {
    if (!isOrbyt || !channel?.uri) return false;
    const orbytChannel = getChannelByUri(channel.uri);
    return orbytChannel?.isPostable !== false; // Default to true, only false for non-postable channels
  }, [isOrbyt, channel]);

  // Create children with subscribe button and other content
  const headerChildren = useMemo(
    () => (
      <>
        {channel && (
          <SubscribeButton
            channel={channel}
            textColor={safeTextColor}
            backgroundColor={safeBackgroundColor}
            accentColor={channelColors.accentColor || Colors.black}
            channelColor={channel.uri ? getChannelByUri(channel.uri)?.channelColor : undefined}
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
      hasTabs,
    ]
  );

  // For orbyt channels, use channelGIF as primary avatar/background, fallback to avatar
  // Memoize to prevent flickering when feed changes
  const backgroundImage = useMemo(() => {
    if (!isOrbyt || !channel?.uri) return undefined;

    // Get orbyt channel config to check for channelGIF
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
  }, [isOrbyt, channel]);

  return (
    <>
      <StatusBar
        barStyle={statusBarStyle}
        backgroundColor={safeBackgroundColor}
        translucent={true}
      />
      <UniversalHeader
        content={headerContent}
        backgroundColor={safeBackgroundColor}
        textColor={safeTextColor}
        backgroundImage={backgroundImage}
        applySafeArea={applySafeArea}
        reserveTopForOverlayButtons
        contentStyle={headerStyle}
        minHeight={isOrbyt ? 450 : undefined}
        contentPosition={isOrbyt ? 'bottom' : 'top'}
        hasTabs={hasTabs}
        contentScrollProgress={contentScrollProgressSV}
        contentScrollFadeDisabled={contentFadeDisabled}
        scrollLinkedDimDisabled={dimOverlayDisabled}
      >
        {headerChildren}
      </UniversalHeader>
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
    height: 44,
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
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.FULL,
    borderWidth: 0,
    borderColor: Colors.transparent,
    gap: 6,
  },
  subscribeButtonInner: {
    flex: 1,
  },
  subscribeButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  subscribeButtonGlassBackground: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BORDER_RADIUS.FULL,
  },
  subscribeButtonText: {
    fontFamily: 'Figtree-Bold',
    fontSize: 17,
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
  orbytChannelTitle: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
  title: {
    fontFamily: 'Figtree-Black',
    fontWeight: 'bold',
    fontSize: 28,
    flexShrink: 1,
  },
  orbytSlash: {
    fontFamily: 'Figtree-SemiBold',
    marginRight: 0,
  },
});

export default memo(ChannelHeader);
