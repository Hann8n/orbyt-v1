import React, { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BORDER_RADIUS } from '../../../utils/constants';
import {
  View,
  StyleSheet,
  Text,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useProfileChannelNavigation } from '@/hooks/useProfileChannelNavigation';
import UniversalHeader, { HeaderContent } from './UniversalHeader';
import { useChannelColors } from '../../../services/data/ChannelService';
import { PlusIcon, CheckIcon, ListViewIcon, GridViewIcon, STROKE_WIDTH_THICK } from '../../ui/Icon';
import { NativePressable } from '../../ui/NativePressable';
import type { ViewMode } from '../../../types';
import { hexToRGBA, isColorDark } from '../../../utils/formatting/colors';
import { useProfileStatusBar } from '@/hooks/useProfileStatusBar';
import { Colors } from '../../../theme';
import { FontFamily, TextStyles } from '../../../utils/components/typography';
import { useChannelSubscriptions } from '../../../stores/userStore';
import {
  isOrbytChannel,
  getChannelByUri,
  shouldShowChannelSlash,
  getLocalizedChannelDisplayName,
  getLocalizedChannelDescription,
  getChannelAvatarUri,
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
    useChannelSubscriptions();
  const { width: screenWidth } = useWindowDimensions();
  const isWideScreen = screenWidth > 768;

  const storeSubscribed = !!channel?.uri && subscribedChannels.some(ch => ch.uri === channel.uri);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const isSubscribed = optimistic ?? storeSubscribed;

  const handleSubscribe = useCallback(() => {
    if (!channel?.uri) return;
    const next = !isSubscribed;
    setOptimistic(next);
    if (next) {
      subscribeToChannel({
        uri: channel.uri,
        displayName: channel.name,
        description: channel.description,
        avatar: channel.avatar,
        memberCount: channel.likeCount,
      }).catch(() => setOptimistic(null));
    } else {
      unsubscribeFromChannel(channel.uri).catch(() => setOptimistic(null));
    }
  }, [channel, isSubscribed, subscribeToChannel, unsubscribeFromChannel]);

  const activeFillColor = useMemo(() => channelColor || textColor, [channelColor, textColor]);
  const activeContentColor = useMemo(
    () => (isColorDark(activeFillColor) ? Colors.neutral[50] : Colors.black),
    [activeFillColor]
  );
  const buttonBackgroundColor = isSubscribed ? activeFillColor : Colors.transparent;
  const contentColor = isSubscribed ? activeContentColor : textColor;

  if (channel.isOwner) return null;

  const subscribePill = (
    <View
      style={[
        styles.subscribeButton,
        styles.subscribeButtonInner,
        { backgroundColor: buttonBackgroundColor },
      ]}
    >
      {!isSubscribed && <BlurView style={styles.subscribeButtonBlur} intensity={40} tint="light" />}
      <View pointerEvents="none" style={styles.subscribeButtonContent}>
        <Text style={[styles.subscribeButtonText, { color: contentColor }]}>
          {isSubscribed ? t('settings.subscribed') : t('settings.subscribe')}
        </Text>
        {isSubscribed ? (
          <CheckIcon size={16} color={contentColor} strokeWidth={STROKE_WIDTH_THICK} />
        ) : (
          <PlusIcon size={16} color={contentColor} strokeWidth={STROKE_WIDTH_THICK} />
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
      <NativePressable style={subscribeTouchStyle} onPress={handleSubscribe}>
        {subscribePill}
      </NativePressable>

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

  const safeTextColor = Colors.neutral[50];

  const safeBackgroundColor = Colors.black;

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

  // Status bar: imperative API for zero re-render overhead
  useProfileStatusBar(safeTextColor, true, contentScrollProgressSV);

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

  const backgroundImage = useMemo(() => {
    if (!isOrbyt || !channel?.uri) return undefined;
    return getChannelAvatarUri(channel.uri, channel.avatar);
  }, [isOrbyt, channel]);

  return (
    <>
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
  subscribeButtonBlur: {
    ...StyleSheet.absoluteFill,
    borderRadius: BORDER_RADIUS.FULL,
    overflow: 'hidden',
  },
  subscribeButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  subscribeButtonText: {
    ...TextStyles.headerAction,
    fontFamily: FontFamily.bold,
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
    ...TextStyles.pageTitle,
    fontWeight: 'bold',
    flexShrink: 1,
    textTransform: 'lowercase',
  },
  orbytSlash: {
    fontFamily: FontFamily.semibold,
    marginRight: 0,
  },
});

export default memo(ChannelHeader);
