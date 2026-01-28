import React, { useState, useEffect } from 'react';
import { BORDER_RADIUS } from '../../../utils/constants';
import { View, Text, StyleSheet, Dimensions, Pressable, FlatList } from 'react-native';
import { Image } from 'expo-image';
import Icon from '../../ui/Icon';
import { Colors, RetryButton } from '../../ui/UI';
import AnimatedTVStatic from '../../ui/AnimatedTVStatic';
import { useQuery } from '@tanstack/react-query';
import AtprotoService from '../../../services/api/AtprotoService';
import { Avatar } from '../../ui/UI';
import { VerificationBadge } from '../badging';
import { useRouter } from 'expo-router';
import { useFollowMutation, useProfile } from '../../../services/data/ProfileService';
import { formatHandle } from '../../../utils/formatting/handles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// Use require for static RN asset to avoid TS module typing issues
const LivingGif = require('../../../assets/livinga18.gif');
const TVStaticGif = require('../../../assets/tv_static.gif');

interface EmptyFeedProps {
  secondaryColor?: string;
  message?: string;
  type?: 'no-connection' | 'no-videos' | 'error' | 'no-following' | 'end';
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
  const navigation = useRouter();
  const [suggestedUsers, setSuggestedUsers] = useState<SuggestedUser[]>([]);
  const insets = useSafeAreaInsets();

  // Fetch suggested users when this is a following feed with no videos or as end card
  const isFollowingFeed = feedOption === 'following';
  const isYourMixFeed = feedOption === 'your-mix';
  // Show suggestions for following feed (both empty state and end card)
  const shouldShowSuggestions = isFollowingFeed;

  // Simple unified empty message for no-videos state
  const getNoVideosMessage = (): string => {
    if (isYourMixFeed) {
      return 'nothing on the air...';
    }
    return 'nothing here yet...';
  };

  const { data: suggestedAccounts } = useQuery({
    queryKey: ['suggestedAccounts', 5],
    queryFn: () => AtprotoService.getSuggestedAccounts(5),
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
          defaultMessage: "can't connect to feed",
        };
      case 'error':
        return {
          icon: 'alert-circle',
          defaultMessage: 'something went wrong',
        };
      case 'no-following':
        return {
          icon: 'user-plus',
          defaultMessage: 'follow accounts to see their posts here',
        };
      case 'end': {
        const endMessage = () => {
          switch (feedOption) {
            case 'following':
              return '';
            case 'your-mix':
              return "that's all from your channels";
            case 'discover':
              return 'explore more content';
            default:
              return "that's all for now";
          }
        };
        return {
          icon: 'video-movies-vintage-tv-1',
          defaultMessage: endMessage(),
        };
      }
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
  const iconColor = profileColors ? profileColors.textColor : secondaryColor || Colors.lightGray;
  const textColor = profileColors ? profileColors.textColor : secondaryColor || Colors.lightGray;

  // Suggested user item component (must be a component to use hooks)
  const SuggestedUserItem: React.FC<{ item: SuggestedUser }> = ({ item }) => {
    const { data: profile } = useProfile(item.handle || null);
    const isFollowing = !!profile?.viewer?.following || !!item.viewer?.following;

    return (
      <View style={styles.profileItem}>
        <View style={styles.profileTouchable}>
          <Avatar
            uri={item.avatar}
            type="profile"
            size={40}
            ringColor="transparent"
            style={styles.profileImage}
          />
          <View style={styles.profileContent}>
            <View style={styles.displayNameRow}>
              <Text style={styles.displayName} numberOfLines={1} ellipsizeMode="tail">
                {item.displayName || formatHandle(item.handle) || 'Unknown user'}
              </Text>
              {item.handle && item.handle.trim() && item.handle.length > 0 && (
                <VerificationBadge
                  handle={item.handle.trim()}
                  textSize={14}
                  textColor={Colors.white}
                />
              )}
            </View>
          </View>
        </View>
        {!isFollowing && (
          <Pressable
            style={styles.followButton}
            onPress={() => {
              followMutation.mutate({
                did: item.did,
                handle: item.handle,
                isFollowing: !isFollowing,
              });
            }}
          >
            <Icon name="user-plus" size={16} color={Colors.black} />
          </Pressable>
        )}
      </View>
    );
  };

  // Render suggested user item using explore screen UI pattern
  const renderSuggestedUser = ({ item }: { item: SuggestedUser }) => (
    <SuggestedUserItem item={item} />
  );

  // Calculate top offset so content appears around the top third of the available area
  const containerHeight = viewableAreaHeight
    ? viewableAreaHeight
    : Dimensions.get('window').height - insets.top - insets.bottom;
  const shouldOffsetTop = type !== 'end';
  const topThirdOffset = shouldOffsetTop ? Math.max(0, Math.floor(containerHeight / 5)) : 0;

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
            <Text style={styles.sectionTitle}>suggested accounts</Text>
          </View>
          <FlatList
            data={suggestedUsers}
            renderItem={renderSuggestedUser}
            keyExtractor={item => item.did}
            scrollEnabled={false}
            style={styles.suggestionsList}
            contentContainerStyle={styles.listContainer}
          />
        </View>
      </View>
    );
  }
  // Special case: end of feed card
  if (type === 'end') {
    // For following feed, show the "follow accounts" UI with suggestions
    if (feedOption === 'following' && shouldShowSuggestions && suggestedUsers.length > 0) {
      return (
        <View
          style={[
            styles.emptyContainer,
            styles.justifyCenter,
            { backgroundColor: Colors.black },
            viewableAreaHeight ? { height: viewableAreaHeight } : {},
          ]}
        >
          <View style={[styles.contentContainer, styles.centerContent, styles.justifyCenter]}>
            <View style={styles.iconContainer}>
              <Image
                source={TVStaticGif}
                style={styles.animatedGif}
                contentFit="contain"
                cachePolicy="memory-disk"
                priority="low"
                allowDownscaling={true}
              />
            </View>
            {displayMessage && (
              <Text style={[styles.emptyText, { color: Colors.white }]}>{displayMessage}</Text>
            )}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>suggested accounts</Text>
            </View>
            <FlatList
              data={suggestedUsers}
              renderItem={renderSuggestedUser}
              keyExtractor={item => item.did}
              scrollEnabled={false}
              style={styles.suggestionsList}
              contentContainerStyle={styles.listContainer}
            />
          </View>
        </View>
      );
    }

    return (
      <View
        style={[
          styles.emptyContainer,
          styles.justifyCenter,
          { backgroundColor: Colors.black },
          viewableAreaHeight ? { height: viewableAreaHeight } : {},
        ]}
      >
        <View style={[styles.contentContainer, styles.justifyCenter]}>
          <View style={styles.iconContainer}>
            <Image
              source={LivingGif}
              style={styles.animatedGif}
              contentFit="contain"
              cachePolicy="memory-disk"
              priority="low"
              allowDownscaling={true}
            />
          </View>
          <Text style={[styles.emptyText, { color: Colors.white }]}>{displayMessage}</Text>
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
      <View style={[styles.contentContainer, shouldOffsetTop && { paddingTop: topThirdOffset }]}>
        <View style={styles.iconContainer}>
          {type === 'no-videos' ? (
            <AnimatedTVStatic size={80} />
          ) : (
            <Icon name={icon} size={72} color={isNoVideos ? Colors.lightGray : iconColor} />
          )}
        </View>
        <Text style={[styles.emptyText, { color: isNoVideos ? Colors.lightGray : textColor }]}>
          {displayMessage}
        </Text>
        {isYourMixFeed && type === 'no-videos' && (
          <Pressable
            style={styles.addChannelsButton}
            onPress={() => {
              navigation.push('/explore');
            }}
          >
            <Text style={styles.addChannelsButtonText}>Explore Channels</Text>
          </Pressable>
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
    paddingHorizontal: 20,
    width: '100%',
    flex: 1,
  },
  emptyText: {
    color: Colors.white,
    opacity: 0.7,
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
    width: 80,
    height: 80,
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
    color: Colors.white,
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
    color: Colors.white,
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
    backgroundColor: Colors.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginLeft: 10,
  },
  addChannelsButton: {
    backgroundColor: Colors.white,
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

export default React.memo(EmptyFeed);
