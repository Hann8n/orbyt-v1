import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { BORDER_RADIUS } from '../../../utils/constants';
import { View, Text, StyleSheet, Dimensions, FlatList } from 'react-native';
import { SquircleNativePressable } from '@/components/ui/Squircle';
import { Image } from 'expo-image';
import Icon from '../../ui/Icon';
import { Colors } from '../../../theme';
import { RetryButton } from '../../ui/UI';
import AnimatedTVStatic from '../../ui/AnimatedTVStatic';
import { useQuery } from '@tanstack/react-query';
import { ActorService } from '../../../services/api/actor/ActorService';
import { Avatar } from '../../ui/UI';
import { VerificationBadge, BotBadge } from '../badging';
import { useRouter } from 'expo-router';
import { useFollowMutation, useProfile } from '../../../services/data/ProfileService';
import { useAvatarProfileRing } from '../../../services/colors';
import { formatHandle } from '../../../utils/formatting/handles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// Use require for static RN asset to avoid TS module typing issues
const TVStaticGif = require('../../../assets/tv_static.gif');
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
  isProfileFeed?: boolean;
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
  followMutation: ReturnType<typeof useFollowMutation>;
  t: TFunction;
};

const suggestedUserKeyExtractor = (item: SuggestedUser, _index: number): string => item.did;

const SuggestedUserItem: React.FC<SuggestedUserItemProps> = ({ item, followMutation, t }) => {
  const { data: profile } = useProfile(item.handle || null);
  const ringProps = useAvatarProfileRing(item.did ?? null);
  const isFollowing = !!profile?.viewer?.following || !!item.viewer?.following;

  return (
    <View style={styles.profileItem}>
      <View style={styles.profileTouchable}>
        <Avatar
          uri={item.avatar}
          type="profile"
          size={40}
          showRing={ringProps.showRing}
          ringColor={ringProps.ringColor}
          profileColors={ringProps.profileColors}
          style={styles.profileImage}
        />
        <View style={styles.profileContent}>
          <View style={styles.displayNameRow}>
            <Text style={styles.displayName} numberOfLines={1} ellipsizeMode="tail">
              {item.displayName || formatHandle(item.handle) || t('feed.unknownUser')}
            </Text>
            {item.handle && item.handle.trim() && item.handle.length > 0 && (
              <VerificationBadge
                handle={item.handle.trim()}
                textSize={14}
                textColor={Colors.neutral[50]}
              />
            )}
            {item.handle && item.handle.trim() && item.handle.length > 0 && (
              <BotBadge
                handle={item.handle.trim()}
                did={item.did}
                labels={profile?.labels}
                textSize={14}
                textColor={Colors.neutral[50]}
              />
            )}
          </View>
        </View>
      </View>
      {!isFollowing && (
        <SquircleNativePressable
          style={styles.followButton}
          onPress={() => {
            followMutation.mutate({
              did: item.did,
              handle: item.handle,
              isFollowing: !isFollowing,
            });
          }}
        >
          <Icon name="user_add_2" size={16} color={Colors.black} />
        </SquircleNativePressable>
      )}
    </View>
  );
};

const EmptyFeed: React.FC<EmptyFeedProps> = ({
  secondaryColor,
  message,
  type = 'no-videos',
  profileColors,
  onRetry,
  isProfileFeed = false,
  viewableAreaHeight,
  feedOption,
}) => {
  const { t } = useTranslation();
  const navigation = useRouter();
  const [suggestedUsers, setSuggestedUsers] = useState<SuggestedUser[]>([]);
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

  // Update suggested users when data comes in
  useEffect(() => {
    if (suggestedAccounts && shouldShowSuggestions) {
      setSuggestedUsers(suggestedAccounts);
    }
  }, [suggestedAccounts, shouldShowSuggestions]);

  // Use ProfileCache's follow mutation hook
  const followMutation = useFollowMutation();

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
  const textColor = profileColors ? profileColors.textColor : secondaryColor || Colors.neutral[200];

  // Render suggested user item using explore screen UI pattern
  const renderSuggestedUser = ({ item }: { item: SuggestedUser }) => (
    <SuggestedUserItem item={item} followMutation={followMutation} t={t} />
  );

  // Offset from top so icon + copy sit near the middle of the upper third (H/6 ≈ center of [0, H/3]).
  const containerHeight = viewableAreaHeight
    ? viewableAreaHeight
    : Dimensions.get('window').height - insets.top - insets.bottom;
  const topThirdOffset = Math.max(0, Math.floor(containerHeight / 6));

  // Show suggested users for following feed with no videos
  if (shouldShowSuggestions && suggestedUsers.length > 0) {
    return (
      <View
        style={[
          styles.emptyContainer,
          viewableAreaHeight
            ? { height: viewableAreaHeight }
            : {
                minHeight: isProfileFeed
                  ? Dimensions.get('window').height - insets.top - insets.bottom
                  : Dimensions.get('window').height - insets.top - insets.bottom,
                paddingTop: insets.top,
                paddingBottom: insets.bottom,
              },
        ]}
      >
        <View style={[styles.contentContainer, styles.centerContent]}>
          <View style={styles.iconContainer}>
            <Image source={TVStaticGif} style={styles.animatedGif} contentFit="contain" />
          </View>
          {displayMessage && (
            <Text style={[styles.emptyText, { color: textColor }]}>{displayMessage}</Text>
          )}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('feed.suggestedAccounts')}</Text>
          </View>
          <FlatList
            data={suggestedUsers}
            renderItem={renderSuggestedUser}
            keyExtractor={suggestedUserKeyExtractor}
            scrollEnabled={false}
            style={styles.suggestionsList}
            contentContainerStyle={styles.listContainer}
          />
        </View>
      </View>
    );
  }

  const isNoVideos = type === 'no-videos';
  return (
    <View
      style={[
        styles.emptyContainer,
        isNoVideos && { backgroundColor: Colors.black },
        viewableAreaHeight ? { height: viewableAreaHeight } : undefined,
      ]}
    >
      <View style={[styles.contentContainer, { paddingTop: topThirdOffset }]}>
        <View style={styles.iconContainer}>
          {type === 'no-videos' ? (
            <AnimatedTVStatic size={EMPTY_FEED_TV_SIZE} />
          ) : (
            <Icon name={icon} size={72} color={isNoVideos ? Colors.neutral[200] : iconColor} />
          )}
        </View>
        <Text style={[styles.emptyText, { color: isNoVideos ? Colors.neutral[200] : textColor }]}>
          {displayMessage}
        </Text>
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
    fontSize: 16,
    fontFamily: 'Figtree-SemiBold',
    marginTop: 0,
    textAlign: 'center',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  justifyCenter: {
    justifyContent: 'center',
  },
  iconContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  animatedGif: {
    width: EMPTY_FEED_TV_SIZE,
    height: EMPTY_FEED_TV_SIZE,
  },
  // Matching ExploreScreen styles exactly
  sectionHeader: {
    paddingHorizontal: 0,
    paddingTop: 15,
    paddingBottom: 10,
    width: '100%',
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Figtree-Bold',
    fontWeight: 'bold',
    color: Colors.neutral[50],
  },
  suggestionsList: {
    width: '100%',
    maxHeight: 300,
  },
  listContainer: {
    paddingHorizontal: 0,
    paddingBottom: 20,
  },
  profileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 0,
    position: 'relative',
  },
  profileTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  profileImage: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.LARGE,
    marginRight: 12,
    borderWidth: 0,
    borderColor: Colors.transparent,
  },
  profileContent: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  displayNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  displayName: {
    color: Colors.neutral[50],
    fontSize: 16,
    marginBottom: 2,
    fontFamily: 'Figtree-SemiBold',
    flexShrink: 1,
  },
  followButton: {
    width: 32,
    height: 32,
    borderWidth: 0,
    borderColor: Colors.transparent,
    borderRadius: BORDER_RADIUS.SMALL,
    backgroundColor: Colors.neutral[200],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginLeft: 10,
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
    fontSize: 16,
    fontFamily: 'Figtree-SemiBold',
  },
});

export default EmptyFeed;
