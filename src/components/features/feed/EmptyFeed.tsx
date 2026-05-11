import React from 'react';
import { useTranslation } from 'react-i18next';
import { BORDER_RADIUS } from '../../../utils/constants';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { SquircleNativePressable } from '@/components/ui/Squircle';
import Icon from '../../ui/Icon';
import { Colors } from '../../../theme';
import { RetryButton } from '../../ui/UI';
import AnimatedTVStatic from '../../ui/AnimatedTVStatic';
import { useQuery } from '@tanstack/react-query';
import { ActorService } from '../../../services/api/actor/ActorService';
import AuthorItem from '../../ui/AuthorItem';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontFamily, Typography } from '../../../utils/components/typography';
import { getEndOfFeedOverscrollTextColor } from './feedViewShared';

const EMPTY_FEED_TV_SIZE = 70;

interface EmptyFeedProps {
  secondaryColor?: string;
  message?: string;
  type?: 'no-connection' | 'no-videos' | 'error' | 'no-following';
  profileColors?: {
    backgroundColor: string;
    textColor: string;
  };

  onRetry?: () => void;
  viewableAreaHeight?: number;
  feedOption?: string;
}

interface SuggestedUser {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  description?: string;
  viewer?: {
    following?: string;
    followedBy?: string;
  };
}

type SuggestedUserItemProps = {
  item: SuggestedUser;
};

const SuggestedUserItem: React.FC<SuggestedUserItemProps> = ({ item }) => {
  const isFollowing = !!item.viewer?.following;

  return (
    <AuthorItem
      handle={item.handle || ''}
      did={item.did}
      displayName={item.displayName}
      avatar={item.avatar}
      size="large"
      showArrow={false}
      showFollowButton={!isFollowing}
      isFollowing={isFollowing}
      backgroundColor={Colors.transparent}
      textColor={Colors.neutral[50]}
      nameFontWeight="Figtree-SemiBold"
      skipServerProfileData
      variant="listRow"
      handleAsDisplayName
      style={styles.authorItem}
    />
  );
};

const EmptyFeed: React.FC<EmptyFeedProps> = ({
  secondaryColor,
  message,
  type = 'no-videos',
  profileColors,
  onRetry,
  viewableAreaHeight,
  feedOption,
}) => {
  const { t } = useTranslation();
  const navigation = useRouter();
  const insets = useSafeAreaInsets();

  // Fetch suggested users when this is a following feed with no videos
  const isFollowingFeed = feedOption === 'following';
  const isYourMixFeed = feedOption === 'your-mix';
  const shouldShowSuggestions = isFollowingFeed;

  // Simple unified empty message for no-videos state
  const getNoVideosMessage = (): string => {
    if (isYourMixFeed) {
      return t('feed.nothingOnTheAir');
    }
    return t('feed.nothingHereYet');
  };

  const { data: suggestedAccounts } = useQuery({
    queryKey: ['suggestedAccounts', 5],
    queryFn: () => ActorService.getSuggestedAccounts(5),
    enabled: shouldShowSuggestions,
    staleTime: 60 * 1000, // 1 minute
  });

  const suggestedUsers = shouldShowSuggestions ? (suggestedAccounts ?? []) : [];

  // Determine icon and message based on type
  const getIconAndMessage = () => {
    switch (type) {
      case 'no-connection':
        return {
          icon: 'alert-circle',
          defaultMessage: t('feed.cantConnectToFeed'),
        };
      case 'error':
        return {
          icon: 'alert-circle',
          defaultMessage: t('feed.somethingWentWrong'),
        };
      case 'no-following':
        return {
          icon: 'user-plus',
          defaultMessage: t('feed.followAccountsToSeePosts'),
        };
      case 'no-videos':
      default:
        return {
          icon: 'interface-essential-search-binocular',
          defaultMessage: getNoVideosMessage(),
        };
    }
  };

  const { icon, defaultMessage } = getIconAndMessage();
  const displayMessage = message || defaultMessage;

  // Use profile colors if available, otherwise fall back to secondaryColor or default
  const iconColor = profileColors ? profileColors.textColor : secondaryColor || Colors.neutral[200];
  const textColor = profileColors
    ? getEndOfFeedOverscrollTextColor(profileColors.textColor, secondaryColor)
    : secondaryColor || Colors.neutral[200];

  // Offset from top so icon + copy sit near the middle of the upper third (H/6 ≈ center of [0, H/3]).
  const containerHeight = viewableAreaHeight
    ? viewableAreaHeight
    : Dimensions.get('window').height - insets.top - insets.bottom;
  const topThirdOffset = Math.max(0, Math.floor(containerHeight / 6));

  const isNoVideos = type === 'no-videos';
  const shouldRenderSuggestions = shouldShowSuggestions && suggestedUsers.length > 0;
  const shouldUseEmptyFeedAnimation = type === 'no-videos' || shouldShowSuggestions;
  const noVideosColor = profileColors ? textColor : Colors.neutral[200];
  return (
    <View
      style={[
        styles.emptyContainer,
        viewableAreaHeight
          ? { height: viewableAreaHeight }
          : shouldRenderSuggestions
            ? {
                minHeight: Dimensions.get('window').height - insets.top - insets.bottom,
                paddingTop: insets.top,
                paddingBottom: insets.bottom,
              }
            : undefined,
      ]}
    >
      <View
        style={[
          styles.contentContainer,
          shouldRenderSuggestions ? styles.suggestionsContent : { paddingTop: topThirdOffset },
        ]}
      >
        <View style={styles.iconContainer}>
          {shouldUseEmptyFeedAnimation ? (
            <AnimatedTVStatic size={EMPTY_FEED_TV_SIZE} />
          ) : (
            <Icon name={icon} size={72} color={isNoVideos ? noVideosColor : iconColor} />
          )}
        </View>
        <Text style={[styles.emptyText, { color: isNoVideos ? noVideosColor : textColor }]}>
          {displayMessage}
        </Text>
        {shouldRenderSuggestions && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('feed.suggestedAccounts')}</Text>
            </View>
            <View style={styles.suggestionsList}>
              {suggestedUsers.map(item => (
                <SuggestedUserItem key={item.did} item={item} />
              ))}
            </View>
          </>
        )}
        {isYourMixFeed && type === 'no-videos' && (
          <SquircleNativePressable
            style={styles.addChannelsButton}
            onPress={() => {
              navigation.navigate('/explore');
            }}
          >
            <Text style={styles.addChannelsButtonText}>{t('feed.exploreChannels')}</Text>
          </SquircleNativePressable>
        )}
        {onRetry && (type === 'error' || type === 'no-connection') && (
          <RetryButton onPress={onRetry} />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    backgroundColor: Colors.transparent,
  },
  contentContainer: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 24,
    width: '100%',
    flex: 1,
  },
  emptyText: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.subtitle,
    fontFamily: FontFamily.semibold,
    textAlign: 'center',
  },
  suggestionsContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  sectionHeader: {
    paddingHorizontal: 0,
    paddingTop: 15,
    paddingBottom: 10,
    width: '100%',
  },
  sectionTitle: {
    fontSize: Typography.sizes.title,
    fontFamily: FontFamily.bold,
    fontWeight: 'bold',
    color: Colors.neutral[50],
  },
  suggestionsList: {
    width: '100%',
    paddingHorizontal: 0,
    paddingBottom: 20,
  },
  authorItem: {
    paddingVertical: 10,
    paddingHorizontal: 0,
  },
  addChannelsButton: {
    backgroundColor: Colors.neutral[50],
    borderRadius: BORDER_RADIUS.FULL,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderWidth: 0,
    borderColor: Colors.transparent,
    marginTop: 24,
  },
  addChannelsButtonText: {
    color: Colors.black,
    fontSize: Typography.sizes.subtitle,
    fontFamily: FontFamily.semibold,
  },
});

export default EmptyFeed;
