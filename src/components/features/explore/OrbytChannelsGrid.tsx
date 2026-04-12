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
import { SquircleView } from '@/components/ui/Squircle';
import { Icon } from '@/components/ui/UI';
import { LinearGradient } from '@/components/ui/LinearGradient';
import { Colors } from '@/theme';
import {
  isOrbytChannel,
  getChannelByUri,
  getChannelAvatarUri,
  getLocalizedChannelDisplayName,
  shouldShowChannelSlash,
} from '@/utils/channels/orbyt';
import { useProfileChannelNavigation } from '@/hooks/useProfileChannelNavigation';
import { navigateToEncodedChannelUri } from '@/utils/navigation/navigateEncodedChannel';
import type { Channel } from './types';
import { exploreScreenStyles as styles } from './ExploreScreenStyles';

const CORNER_GRADIENT = require('@/assets/corner-gradient.png');

type ChannelNameVariant = 'list' | 'grid';

const nameStyles: Record<ChannelNameVariant, TextStyle> = {
  list: styles.channelName,
  grid: styles.gridChannelName,
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
  const slashColor = { color: channelColor } as TextStyle;

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
      <SquircleView
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
              { backgroundColor: Colors.neutral[925] },
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
      </SquircleView>
    </NativePressable>
  );
};

export const OrbytChannelsGrid = React.memo(({ channels }: { channels: Channel[] }) => {
  const { navigateToChannel: goToChannel } = useProfileChannelNavigation();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isTablet =
    Device.deviceType === Device.DeviceType.TABLET || Math.min(windowWidth, windowHeight) >= 600;

  const computedColumns = useMemo(() => {
    const w = windowWidth || Dimensions.get('window').width;
    let cols: number;
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

  const { itemWidth } = useMemo(() => {
    const screenWidth = windowWidth || Dimensions.get('window').width;
    const availableWidth = screenWidth - padding * 2;

    const calculatedItemWidth = Math.floor(
      (availableWidth - (computedColumns - 1) * gap) / computedColumns
    );
    return {
      itemWidth: calculatedItemWidth,
    };
  }, [windowWidth, padding, gap, computedColumns]);

  return (
    <View style={[styles.channelsGridContainer, { paddingHorizontal: padding }]}>
      {channels.length > 0 && (
        <View style={styles.gridItemsContainer}>
          {channels.map((channel, index) => {
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
