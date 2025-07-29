import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, FlatList } from 'react-native';
import Icon from '../../ui/Icon';
import { Colors } from '../../ui/UI';
import { useQuery } from '@tanstack/react-query';
import AtprotoService from '../../../services/api/AtprotoService';
import { Avatar } from '../../ui/UI';
import VerificationBadge from '../verification/VerificationBadge';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import ProfileCache from '../../../services/cache/ProfileCache';

interface EmptyFeedProps {
  secondaryColor?: string;
  message?: string;
  type?: 'no-connection' | 'no-videos' | 'error' | 'no-following' | 'end';
  profileColors?: {
    backgroundColor: string;
    textColor: string;
  };
  feedKey?: string;
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
  feedKey,
  onRetry,
  isProfileFeed = false,
  viewableAreaHeight,
  feedOption
}) => {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const [suggestedUsers, setSuggestedUsers] = useState<SuggestedUser[]>([]);

  // Fetch suggested users when this is a following feed with no videos
  const isFollowingFeed = feedOption === 'following';
  const shouldShowSuggestions = isFollowingFeed && (type === 'no-videos' || type === 'no-following');

  const { data: suggestedAccounts, isLoading: isLoadingSuggestions } = useQuery({
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

  // Follow mutation
  const followMutation = useMutation({
    mutationFn: async ({ profile }: { profile: SuggestedUser }) => {
      await AtprotoService.follow(profile.did);
      return profile;
    },
    onMutate: async ({ profile }) => {
      // Optimistically update the UI
      setSuggestedUsers(prev => 
        prev.map(user => 
          user.did === profile.did 
            ? { ...user, viewer: { ...user.viewer, following: 'true' } }
            : user
        )
      );
    },
    onError: (_, __, context) => {
      // Revert optimistic update on error
      if (suggestedAccounts) {
        setSuggestedUsers(suggestedAccounts);
      }
    },
    onSettled: async (profile) => {
      if (profile) {
        const freshProfile = await AtprotoService.getProfile(profile.handle);
        await ProfileCache.updateFollowingStatus(
          profile.handle, 
          !!freshProfile?.viewer?.following
        );
      }
    }
  });

  // Unfollow mutation
  const unfollowMutation = useMutation({
    mutationFn: async ({ profile }: { profile: SuggestedUser }) => {
      await AtprotoService.unfollow(profile.did);
      return profile;
    },
    onMutate: async ({ profile }) => {
      // Optimistically update the UI
      setSuggestedUsers(prev => 
        prev.map(user => 
          user.did === profile.did 
            ? { ...user, viewer: { ...user.viewer, following: undefined } }
            : user
        )
      );
    },
    onError: (_, __, context) => {
      // Revert optimistic update on error
      if (suggestedAccounts) {
        setSuggestedUsers(suggestedAccounts);
      }
    },
    onSettled: async (profile) => {
      if (profile) {
        const freshProfile = await AtprotoService.getProfile(profile.handle);
        await ProfileCache.updateFollowingStatus(
          profile.handle, 
          !!freshProfile?.viewer?.following
        );
      }
    }
  });

  // Determine icon and message based on type
  const getIconAndMessage = () => {
    switch (type) {
      case 'no-connection':
        return {
          icon: 'interface-essential-satellite',
          defaultMessage: "Can't connect to feed"
        };
      case 'error':
        return {
          icon: 'interface-essential-satellite',
          defaultMessage: "Something went wrong"
        };
      case 'no-following':
        return {
          icon: 'user-plus',
          defaultMessage: "Follow accounts to see their posts here"
        };
      case 'end':
        return {
          icon: 'video-movies-vintage-tv-1',
          defaultMessage: "That's all for now"
        };
      case 'no-videos':
      default:
        return {
          icon: 'interface-essential-search-binocular',
          defaultMessage: isProfileFeed ? "No videos posted yet" : "Nothing to see here yet..."
        };
    }
  };

  const { icon, defaultMessage } = getIconAndMessage();
  const displayMessage = message || defaultMessage;
  
  // Use profile colors if available, otherwise fall back to secondaryColor or default
  const iconColor = profileColors ? profileColors.textColor : (secondaryColor || Colors.TEXT.SECONDARY);
  const textColor = profileColors ? profileColors.textColor : (secondaryColor || Colors.TEXT.SECONDARY);

  // Render suggested user item - matching ExploreScreen styling exactly
  const renderSuggestedUser = ({ item }: { item: SuggestedUser }) => {
    const isFollowing = !!item.viewer?.following;
    
    return (
      <TouchableOpacity
        style={styles.profileItem}
        onPress={() => {
          if (item.handle) {
            const handle = item.handle.trim();
            if (handle && handle.trim()) {
              queryClient.prefetchQuery({
                queryKey: ['profile', handle.trim()],
                queryFn: () => ProfileCache.getProfile(handle.trim()),
                staleTime: ProfileCache.cacheExpiry
              }).finally(() => {
                navigation.navigate('AuthorProfile', { handle: handle.trim() });
              });
            }
          }
        }}
      >
        <Avatar
          uri={item.avatar}
          type="profile"
          size={40}
          style={styles.profileImage}
        />
        <View style={styles.profileContent}>
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <Text style={[styles.displayName, { color: textColor }]} numberOfLines={1}>
              {item.displayName || item.handle || 'Unknown user'}
            </Text>
            {item.handle && item.handle.trim() && item.handle.length > 0 && (
              <VerificationBadge 
                handle={item.handle.trim()} 
                textSize={14} 
                textColor={textColor}
              />
            )}
          </View>
          <Text style={[styles.handleText, { color: textColor }]} numberOfLines={1}>
            @{item.handle || 'unknown'}
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.followButton,
            { borderColor: textColor },
            isFollowing && { backgroundColor: textColor }
          ]}
          onPress={() => {
            if (isFollowing) {
              unfollowMutation.mutate({ profile: item });
            } else {
              followMutation.mutate({ profile: item });
            }
          }}
        >
          <Text style={[
            styles.followButtonText,
            { color: isFollowing ? (profileColors?.backgroundColor || '#000') : textColor }
          ]}>
            {isFollowing ? 'Following' : 'Follow'}
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  // Show suggested users for following feed with no videos
  if (shouldShowSuggestions && suggestedUsers.length > 0) {
    return (
      <View 
        key={feedKey ? `empty-feed-${feedKey}` : undefined}
        style={[
          styles.emptyContainer,
          viewableAreaHeight ? { height: viewableAreaHeight } : {}
        ]}
      >
        <View style={styles.contentContainer}>
          <View style={styles.iconContainer}>
            <Icon 
              name={icon} 
              size={72} 
              color={iconColor} 
              iconSet="pixelarticons"
            />
          </View>
          <Text style={[styles.emptyText, { color: textColor }]}>
            {displayMessage}
          </Text>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>
              Suggested accounts
            </Text>
          </View>
          <FlatList
            data={suggestedUsers}
            renderItem={renderSuggestedUser}
            keyExtractor={(item) => item.did}
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
    return (
      <View 
        key={feedKey ? `empty-feed-${feedKey}` : undefined}
        style={[
          styles.emptyContainer,
          viewableAreaHeight ? { height: viewableAreaHeight } : {}
        ]}
      >
        <View style={styles.contentContainer}>
          <View style={styles.iconContainer}>
            <Icon 
              name={icon} 
              size={72} 
              color={iconColor} 
              iconSet="streamline-pixel"
            />
          </View>
          <Text style={[styles.emptyText, { color: textColor }]}> 
            {displayMessage}
          </Text>
        </View>
      </View>
    );
  }
  
  return (
    <View 
      key={feedKey ? `empty-feed-${feedKey}` : undefined}
      style={[
        styles.emptyContainer,
        viewableAreaHeight ? { height: viewableAreaHeight } : {}
      ]}
    >
      <View style={styles.contentContainer}>
        <View style={styles.iconContainer}>
          <Icon 
            name={icon} 
            size={72} 
            color={iconColor} 
            iconSet={type === 'no-following' ? 'pixelarticons' : 'streamline-pixel'}
          />
        </View>
        <Text style={[styles.emptyText, { color: textColor }]}>
          {displayMessage}
        </Text>
        {onRetry && (type === 'error' || type === 'no-connection') && (
          <TouchableOpacity 
            style={[styles.retryButton, { borderColor: textColor }]} 
            onPress={onRetry}
          >
            <Text style={[styles.retryButtonText, { color: textColor }]}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  contentContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    width: '100%',
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
    fontFamily: 'Firma-Medium',
    marginTop: 0,
    textAlign: 'center',
  },
  iconContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  retryButton: {
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 20,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'Firma-Bold',
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
    fontFamily: 'Firma-Bold',
    fontWeight: 'bold',
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
    paddingVertical: 12,
    paddingHorizontal: 0,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.BORDER.PRIMARY,
  },
  profileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    borderWidth: 1,
    borderColor: Colors.BORDER.PRIMARY,
  },
  profileContent: {
    flex: 1,
    justifyContent: 'center',
  },
  displayName: {
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 2,
    fontFamily: 'Firma-SemiBold',
    flexShrink: 1,
  },
  handleText: {
    fontSize: 14,
    fontFamily: 'Firma-Regular',
  },
  followButton: {
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    minWidth: 70,
    alignItems: 'center',
  },
  followButtonText: {
    fontSize: 14,
    fontFamily: 'Firma-Bold',
  },
});

export default EmptyFeed;