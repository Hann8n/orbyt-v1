import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleProp,
  TextStyle,
  ViewStyle,
  useWindowDimensions,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import * as Device from 'expo-device';
import { NativePressable } from '@/components/ui/NativePressable';
import { Avatar, Icon } from '@/components/ui/UI';
import { LinearGradient } from '@/components/ui/LinearGradient';
import { Colors } from '@/theme';
import {
  isOrbytChannel,
  getChannelByUri,
  getChannelAvatarUri,
  getLocalizedChannelDisplayName,
  shouldShowChannelSlash,
  extractFeedSlug,
} from '@/utils/channels/orbyt';
import { useProfileChannelNavigation } from '@/hooks/useProfileChannelNavigation';
import { navigateToEncodedChannelUri } from '@/utils/navigation/navigateEncodedChannel';
import type { Channel } from './types';
import { exploreScreenStyles as styles } from './ExploreScreenStyles';

const CORNER_GRADIENT = require('@/assets/corner-gradient.png');

type ChannelNameVariant = 'list' | 'grid' | 'horizontal';

const nameStyles: Record<ChannelNameVariant, TextStyle> = {
  list: styles.channelName,
  grid: styles.gridChannelName,
  horizontal: styles.horizontalChannelLabel,
};

const ChannelNameDisplay: React.FC<{
  channel: Channel;
  style?: StyleProp<ViewStyle>;
  nameVariant?: ChannelNameVariant;
}> = ({ channel, style, nameVariant = 'list' }) => {
  const { t } = useTranslation();
  const isOrbyt = isOrbytChannel(channel.uri);
  const orbytChannel = isOrbyt ? getChannelByUri(channel.uri) : undefined;
  const channelColor = orbytChannel?.channelColor || Colors.amber[400];
  const displayName =
    getLocalizedChannelDisplayName(channel.uri, channel.displayName) ||
    channel.displayName ||
    t('feed.unknownChannel');

  const nameStyle = nameStyles[nameVariant];
  const slashColor =
    nameVariant === 'horizontal' ? undefined : ({ color: channelColor } as TextStyle);

  if (isOrbyt) {
    const showSlash = shouldShowChannelSlash(channel.uri);
    return (
      <View style={[styles.rowCenter, style]}>
        {showSlash && <Text style={[nameStyle, styles.orbytSlash, slashColor]}>/</Text>}
        <Text style={nameStyle} numberOfLines={1}>
          {displayName}
        </Text>
      </View>
    );
  }

  return (
    <Text style={nameStyle} numberOfLines={1}>
      {displayName}
    </Text>
  );
};

const PopularChannelItem = ({ channel, onPress }: { channel: Channel; onPress: () => void }) => {
  const avatarUri = getChannelAvatarUri(channel.uri, channel.avatar);
  return (
    <NativePressable style={styles.channelItem} onPress={onPress}>
      <Avatar
        uri={avatarUri}
        type="channel"
        size={48}
        ringColor="transparent"
        style={styles.channelImage}
      />
      <View style={styles.channelContent}>
        <View style={styles.rowCenter}>
          <ChannelNameDisplay channel={channel} />
        </View>
      </View>
    </NativePressable>
  );
};

const GridChannelItem = ({
  channel,
  onPress,
  itemWidth,
  itemHeight,
}: {
  channel: Channel;
  onPress: () => void;
  itemWidth: number;
  itemHeight?: number;
}) => {
  const avatarUri = getChannelAvatarUri(channel.uri, channel.avatar);
  const thumbnailHeight = itemHeight || itemWidth;

  return (
    <NativePressable style={[styles.gridChannelItem, { width: itemWidth }]} onPress={onPress}>
      <View
        style={[
          styles.gridChannelThumbnail,
          { height: thumbnailHeight },
          itemHeight ? { aspectRatio: undefined } : {},
        ]}
      >
        {avatarUri ? (
          <Image
            source={{ uri: avatarUri }}
            style={styles.gridChannelImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            priority="normal"
            transition={200}
          />
        ) : (
          <View
            style={[
              styles.gridChannelImage,
              styles.centerContent,
              { backgroundColor: Colors.neutral[900] },
            ]}
          >
            <Icon name="tv_2" size={thumbnailHeight * 0.4} color={Colors.neutral[500]} />
          </View>
        )}
        <LinearGradient
          colors={[Colors.transparent, Colors.overlay.black50]}
          style={styles.gridChannelGradient}
        />
        <Image
          source={CORNER_GRADIENT}
          style={styles.gridChannelCornerGradient}
          contentFit="cover"
        />
        <View style={styles.gridChannelNameOverlay}>
          <ChannelNameDisplay channel={channel} nameVariant="grid" />
        </View>
      </View>
    </NativePressable>
  );
};

const HorizontalChannelItem = ({
  channel,
  onPress,
  itemWidth,
  itemHeight,
}: {
  channel: Channel;
  onPress: () => void;
  itemWidth: number;
  itemHeight: number;
}) => {
  const avatarUri = getChannelAvatarUri(channel.uri, channel.avatar);
  const isOrbyt = isOrbytChannel(channel.uri);
  const orbytChannel = isOrbyt ? getChannelByUri(channel.uri) : undefined;
  const channelColor = orbytChannel?.channelColor || Colors.amber[400];
  const labelMaxWidth = itemWidth - 16 - 16;

  const slug = extractFeedSlug(channel.uri || '');
  const isPopularNow = slug === 'popular-now';
  const isLatest = slug === 'latest';

  return (
    <NativePressable
      style={[
        styles.horizontalChannelButton,
        {
          width: itemWidth,
          height: itemHeight,
          backgroundColor: channelColor,
        },
      ]}
      onPress={onPress}
    >
      <View style={[styles.horizontalChannelThumbnail, isLatest && styles.centerContent]}>
        {isPopularNow ? (
          <Image
            source={{ uri: avatarUri }}
            style={[
              styles.horizontalChannelImage,
              styles.popularNowImage,
              {
                width: itemWidth * 0.7,
                height: itemHeight * 2.5,
              },
            ]}
            contentFit="cover"
            cachePolicy="memory-disk"
            priority="normal"
            transition={200}
          />
        ) : isLatest ? (
          <Image
            source={{ uri: avatarUri }}
            style={[styles.horizontalChannelImage, styles.latestImage]}
            contentFit="cover"
            cachePolicy="memory-disk"
            priority="normal"
            transition={200}
          />
        ) : (
          <Avatar
            uri={avatarUri}
            type="channel"
            size={Math.max(itemWidth, itemHeight)}
            ringColor={Colors.transparent}
            style={styles.horizontalChannelImage}
          />
        )}
      </View>

      <View style={[styles.horizontalChannelLabelContainer, { maxWidth: labelMaxWidth }]}>
        <ChannelNameDisplay channel={channel} nameVariant="horizontal" />
      </View>
    </NativePressable>
  );
};

export { PopularChannelItem };

export const OrbytChannelsGrid = React.memo(({ channels }: { channels: Channel[] }) => {
  const { navigateToChannel: goToChannel } = useProfileChannelNavigation();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isTablet =
    Device.deviceType === Device.DeviceType.TABLET || Math.min(windowWidth, windowHeight) >= 600;

  const computedColumns = useMemo(() => {
    const w = windowWidth || Dimensions.get('window').width;
    let cols = 3;
    if (w > 1200 || isTablet) {
      cols = 6;
    } else if (w > 900) {
      cols = 5;
    } else if (w > 480) {
      cols = 4;
    } else {
      cols = 3;
    }
    return Math.max(3, cols);
  }, [windowWidth, isTablet]);

  const { padding, gap } = useMemo(() => {
    const w = windowWidth || Dimensions.get('window').width;
    if (isTablet || w > 900) {
      return { padding: 10, gap: 10 };
    } else if (w > 480) {
      return { padding: 10, gap: 8 };
    } else {
      return { padding: 10, gap: 7 };
    }
  }, [windowWidth, isTablet]);

  const { itemWidth, fullWidth, specialWidth, buttonHeight } = useMemo(() => {
    const screenWidth = windowWidth || Dimensions.get('window').width;
    const availableWidth = screenWidth - padding * 2;

    const calculatedItemWidth = Math.floor(
      (availableWidth - (computedColumns - 1) * gap) / computedColumns
    );
    const gridItemHeight = calculatedItemWidth;

    const calculatedFullWidth = availableWidth;

    const calculatedSpecialWidth = Math.floor((availableWidth - gap) / 2);

    const calculatedButtonHeight = Math.round(gridItemHeight * 0.8);

    return {
      itemWidth: calculatedItemWidth,
      fullWidth: calculatedFullWidth,
      specialWidth: calculatedSpecialWidth,
      buttonHeight: calculatedButtonHeight,
    };
  }, [windowWidth, padding, gap, computedColumns]);

  const shouldShowSpecialInRow = useMemo(() => {
    return computedColumns >= 4 || isTablet;
  }, [computedColumns, isTablet]);

  const specialItemHeight = useMemo(() => {
    return shouldShowSpecialInRow ? Math.round(buttonHeight * 0.9) : buttonHeight;
  }, [shouldShowSpecialInRow, buttonHeight]);

  const { popularNowChannel, latestChannel, otherChannels } = useMemo(() => {
    let popular: (typeof channels)[0] | undefined;
    let latest: (typeof channels)[0] | undefined;
    const rest: typeof channels = [];

    for (const ch of channels) {
      const slug = extractFeedSlug(ch.uri || '');
      if (slug === 'popular-now') {
        popular = ch;
      } else if (slug === 'latest') {
        latest = ch;
      } else {
        rest.push(ch);
      }
    }

    return {
      popularNowChannel: popular,
      latestChannel: latest,
      otherChannels: rest,
    };
  }, [channels]);

  const renderSpecialItems = () => {
    if (!popularNowChannel && !latestChannel) return null;

    if (shouldShowSpecialInRow) {
      return (
        <View style={[styles.specialRow, { marginBottom: gap }]}>
          {popularNowChannel && (
            <View style={{ width: specialWidth }}>
              <HorizontalChannelItem
                channel={popularNowChannel}
                itemWidth={specialWidth}
                itemHeight={specialItemHeight}
                onPress={() => navigateToEncodedChannelUri(popularNowChannel.uri, goToChannel)}
              />
            </View>
          )}
          {latestChannel && (
            <View style={{ width: specialWidth, marginLeft: gap }}>
              <HorizontalChannelItem
                channel={latestChannel}
                itemWidth={specialWidth}
                itemHeight={specialItemHeight}
                onPress={() => navigateToEncodedChannelUri(latestChannel.uri, goToChannel)}
              />
            </View>
          )}
        </View>
      );
    } else {
      return (
        <View style={{ marginBottom: gap }}>
          {popularNowChannel && (
            <View style={{ width: fullWidth, marginBottom: gap }}>
              <HorizontalChannelItem
                channel={popularNowChannel}
                itemWidth={fullWidth}
                itemHeight={specialItemHeight}
                onPress={() => navigateToEncodedChannelUri(popularNowChannel.uri, goToChannel)}
              />
            </View>
          )}
          {latestChannel && (
            <View style={{ width: fullWidth }}>
              <HorizontalChannelItem
                channel={latestChannel}
                itemWidth={fullWidth}
                itemHeight={specialItemHeight}
                onPress={() => navigateToEncodedChannelUri(latestChannel.uri, goToChannel)}
              />
            </View>
          )}
        </View>
      );
    }
  };

  return (
    <View style={[styles.channelsGridContainer, { paddingHorizontal: padding }]}>
      {renderSpecialItems()}

      {otherChannels.length > 0 && (
        <View style={styles.gridItemsContainer}>
          {otherChannels.map((channel, index) => {
            const isLastInRow = (index + 1) % computedColumns === 0;
            const wrapperStyle = [
              styles.gridChannelWrapper,
              {
                width: itemWidth,
                marginRight: isLastInRow ? 0 : gap,
                marginBottom: gap,
              },
            ];
            return (
              <View
                key={`orbyt-channel-${channel.uri || channel.cid || index}`}
                style={wrapperStyle}
              >
                <GridChannelItem
                  channel={channel}
                  itemWidth={itemWidth}
                  onPress={() => navigateToEncodedChannelUri(channel.uri, goToChannel)}
                />
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
});
OrbytChannelsGrid.displayName = 'OrbytChannelsGrid';
