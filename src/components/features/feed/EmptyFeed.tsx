import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, FlatList } from 'react-native';
import Icon, { TelescopeIcon } from '../../ui/Icon';
import { Colors } from '../../ui/UI';
import { useQuery } from '@tanstack/react-query';
import AtprotoService from '../../../services/api/AtprotoService';
import { Avatar } from '../../ui/UI';
import VerificationBadge from '../verification/VerificationBadge';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import ProfileCache, { useFollowMutation } from '../../../services/cache/ProfileCache';
import AuthorItem from '../../ui/AuthorItem';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  headerHeight?: number; // Add header height prop for profile screens
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
  feedOption,
  headerHeight = 0
}) => {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const [suggestedUsers, setSuggestedUsers] = useState<SuggestedUser[]>([]);
  const insets = useSafeAreaInsets();

  // Fetch suggested users when this is a following feed with no videos
  const isFollowingFeed = feedOption === 'following';
  // Force suggested accounts for timeline feed testing
  const shouldShowSuggestions = isFollowingFeed;

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

  // Use ProfileCache's follow mutation hook
  const followMutation = useFollowMutation();

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
          icon: isProfileFeed ? 'telescope' : 'interface-essential-search-binocular',
          defaultMessage: isProfileFeed ? "No videos posted yet" : "Nothing to see here yet..."
        };
    }
  };

  const { icon, defaultMessage } = getIconAndMessage();
  const displayMessage = message || defaultMessage;
  
  // Use profile colors if available, otherwise fall back to secondaryColor or default
  const iconColor = profileColors ? profileColors.textColor : (secondaryColor || Colors.TEXT.SECONDARY);
  const textColor = profileColors ? profileColors.textColor : (secondaryColor || Colors.TEXT.SECONDARY);

  // Render suggested user item using AuthorItem component
  const renderSuggestedUser = ({ item }: { item: SuggestedUser }) => {
    return (
      <AuthorItem
        handle={item.handle}
        displayName={item.displayName}
        avatar={item.avatar}
        textColor={textColor}
        backgroundColor={profileColors?.backgroundColor || 'transparent'}
        size="medium"
        showArrow={false}
        showFollowButton={true}
        onFollowPress={() => {
          followMutation.mutate({ 
            handle: item.handle, 
            isFollowing: !(ProfileCache.getProfileFromCacheSync(item.handle)?.isFollowing ?? !!item.viewer?.following)
          });
        }}
        style={styles.profileItem}
      />
    );
  };

  // Show suggested users for following feed with no videos
  if (shouldShowSuggestions && suggestedUsers.length > 0) {
    return (
      <View 
        key={feedKey ? `empty-feed-${feedKey}` : undefined}
        style={[
          styles.emptyContainer,
          viewableAreaHeight
            ? { height: viewableAreaHeight }
            : {
                minHeight: isProfileFeed
                  ? Dimensions.get('window').height - insets.top - insets.bottom - headerHeight
                  : Dimensions.get('window').height - insets.top - insets.bottom,
                paddingTop: insets.top,
                paddingBottom: insets.bottom,
              }
        ]}
      >
        <View style={styles.contentContainer}>
          <View style={styles.iconContainer}>
            {isProfileFeed && type === 'no-videos' ? (
              <TelescopeIcon 
                size={72} 
                color={iconColor} 
              />
            ) : (
              <Icon 
                name={icon} 
                size={72} 
                color={iconColor} 
              />
            )}
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
        viewableAreaHeight
          ? { height: viewableAreaHeight }
          : {
              minHeight: isProfileFeed
                ? Dimensions.get('window').height - insets.top - insets.bottom - headerHeight
                : Dimensions.get('window').height - insets.top - insets.bottom,
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
            }
      ]}
    >
              <View style={styles.contentContainer}>
          <View style={styles.iconContainer}>
            {isProfileFeed && type === 'no-videos' ? (
              <TelescopeIcon 
                size={72} 
                color={iconColor} 
              />
            ) : (
              <Icon 
                name={icon} 
                size={72} 
                color={iconColor} 
                iconSet={type === 'no-following' ? 'pixelarticons' : 'streamline-pixel'}
              />
            )}
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
    backgroundColor: '#000',
  },
  contentContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    width: '100%',
    flex: 1,
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
    fontFamily: 'Firma-SemiBold',
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

});

export default EmptyFeed;