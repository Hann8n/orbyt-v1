import React from 'react';
import { Pressable, StyleSheet, Text, View, StyleProp, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { Avatar } from './UI';
import { Colors } from './UI';
import Icon from './Icon';
import { getChannelAvatarUri } from '../../utils/channels/orbyt';
import {
  isOrbytChannel,
  getChannelByUri,
  shouldShowChannelSlash,
} from '../../utils/channels/orbyt';
import { itemSizeConfig, sharedItemStyles } from './ItemStyles';

interface ChannelItemProps {
  uri: string;
  displayName?: string;
  avatar?: string;
  textColor?: string;
  backgroundColor?: string;
  size?: 'small' | 'medium' | 'large';
  showArrow?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  nameFontWeight?:
    | 'Figtree-Regular'
    | 'Figtree-Medium'
    | 'Figtree-SemiBold'
    | 'Figtree-Bold'
    | 'Figtree-Black';
  customFontSize?: number;
}

const ChannelItem: React.FC<ChannelItemProps> = ({
  uri,
  displayName,
  avatar,
  textColor = '#FFFFFF',
  backgroundColor,
  size = 'medium',
  showArrow = true,
  onPress,
  style,
  nameFontWeight = 'Figtree-Bold',
  customFontSize,
}) => {
  const router = useRouter();

  const config = itemSizeConfig[size];
  const actualDisplayName = displayName || 'Unknown channel';
  const avatarUri = getChannelAvatarUri(uri, avatar);

  // Orbyt channel formatting
  const isOrbyt = isOrbytChannel(uri);
  const orbytChannel = isOrbyt ? getChannelByUri(uri) : undefined;
  const channelColor = orbytChannel?.channelColor || '#FFD700';
  const showSlash = isOrbyt && shouldShowChannelSlash(uri);

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else if (uri && uri.trim()) {
      router.push({
        pathname: '/channel/[id]',
        params: { id: uri.trim() },
      });
    }
  };

  return (
    <Pressable
      style={[styles.container, { backgroundColor: backgroundColor || Colors.darkGray }, style]}
      onPress={handlePress}
    >
      <View style={styles.accountButtonContent}>
        <View style={styles.avatarContainer}>
          <Avatar uri={avatarUri} type="channel" size={config.avatarSize} ringColor="transparent" />
        </View>
        <View style={styles.accountInfoContainer}>
          <View style={styles.nameRow}>
            {isOrbyt && showSlash ? (
              <View style={styles.channelNameRow}>
                <Text
                  style={[
                    styles.channelName,
                    styles.orbytSlash,
                    {
                      color: channelColor,
                      fontSize: customFontSize || config.nameFontSize,
                      fontFamily: nameFontWeight,
                    },
                  ]}
                >
                  /
                </Text>
                <Text
                  style={[
                    styles.channelName,
                    {
                      color: textColor || Colors.white,
                      fontSize: customFontSize || config.nameFontSize,
                      fontFamily: nameFontWeight,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {actualDisplayName}
                </Text>
              </View>
            ) : (
              <Text
                style={[
                  styles.channelName,
                  {
                    color: textColor || Colors.white,
                    fontSize: customFontSize || config.nameFontSize,
                    fontFamily: nameFontWeight,
                  },
                ]}
                numberOfLines={1}
              >
                {actualDisplayName}
              </Text>
            )}
          </View>
        </View>
        {showArrow && (
          <View style={styles.accountArrow}>
            <Icon name="chevron-right" size={20} color={Colors.gray} />
          </View>
        )}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: sharedItemStyles.container,
  accountButtonContent: sharedItemStyles.accountButtonContent,
  avatarContainer: sharedItemStyles.avatarContainer,
  accountInfoContainer: sharedItemStyles.accountInfoContainer,
  accountArrow: sharedItemStyles.accountArrow,
  nameRow: sharedItemStyles.nameRow,
  channelName: {
    ...sharedItemStyles.accountDisplayName,
    flexShrink: 1,
  },
  channelNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  orbytSlash: {
    fontFamily: 'Figtree-SemiBold',
    marginRight: 0,
  },
});

export default ChannelItem;
