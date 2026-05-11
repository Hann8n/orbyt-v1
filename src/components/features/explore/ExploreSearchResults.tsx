import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { QUERY_CONSTANTS, SCROLL_INDICATOR_CONSTANTS } from '@/utils/constants';
import { Colors } from '@/theme';
import AuthorItem from '@/components/ui/AuthorItem';
import { useProfileChannelNavigation } from '@/hooks/useProfileChannelNavigation';
import { navigateToEncodedChannelUri } from '@/utils/navigation/navigateEncodedChannel';
import { extractFeedSlug } from '@/utils/channels/orbyt';

import type { ProfileViewWithOrbyt } from '@/services/api/types';
import type { CachedChannel } from '@/services/data/ChannelService';
import {
  type ExploreSearchTabId,
} from './types';
import { prefetchProfileThenOpen } from './prefetchProfileThenOpen';
import { exploreScreenStyles as styles } from './ExploreScreenStyles';

type ExploreSuggestionsProfileRowProps = {
  profile: ProfileViewWithOrbyt;
  queryClient: QueryClient;
  goToProfile: (did: string) => void;
  onFollow: (profile: ProfileViewWithOrbyt) => void;
};

export const ExploreSuggestionsProfileRow = React.memo(
  ({ profile, queryClient, goToProfile, onFollow }: ExploreSuggestionsProfileRowProps) => {
    const isFollowing = !!profile.viewer?.following;

    const handleFollowPress = useCallback(() => {
      onFollow(profile);
    }, [onFollow, profile]);

    const handlePress = useCallback(() => {
      prefetchProfileThenOpen(profile, queryClient, goToProfile);
    }, [profile, queryClient, goToProfile]);

    return (
      <AuthorItem
        handle={profile.handle || ''}
        did={profile.did}
        displayName={profile.displayName}
        avatar={profile.avatar}
        size="large"
        showArrow={false}
        showFollowButton={!isFollowing}
        isFollowing={isFollowing}
        onFollowPress={handleFollowPress}
        onPress={handlePress}
        backgroundColor={Colors.transparent}
        textColor={Colors.neutral[50]}
        nameFontWeight="Figtree-SemiBold"
        skipServerProfileData
        style={styles.authorItemStyle}
      />
    );
  }
);
ExploreSuggestionsProfileRow.displayName = 'ExploreSuggestionsProfileRow';

const ProfilesFeedRenderer = React.memo(
  ({
    profiles,
    isLoading,
    onProfilePress,
    bottomPadding = 0,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  }: {
    profiles: ProfileViewWithOrbyt[];
    isLoading?: boolean;
    onProfilePress?: (profile: ProfileViewWithOrbyt) => void;
    bottomPadding?: number;
    hasNextPage?: boolean;
    isFetchingNextPage?: boolean;
    fetchNextPage?: () => void;
  }) => {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { navigateToProfile: goToProfile } = useProfileChannelNavigation();

    const handleLoadMore = useCallback(() => {
      if (hasNextPage && !isFetchingNextPage && fetchNextPage) {
        fetchNextPage();
      }
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    const renderEmptyProfiles = useCallback(
      () => (
        <View style={styles.emptyTabContent}>
          <Text style={styles.emptyTabText}>{t('feed.noPeopleFound')}</Text>
        </View>
      ),
      [t]
    );

    const renderProfileItem = useCallback(
      ({ item: profile }: { item: ProfileViewWithOrbyt }) => {
        return (
          <AuthorItem
            handle={profile.handle || ''}
            did={profile.did}
            displayName={profile.displayName}
            avatar={profile.avatar}
            size="large"
            showArrow={false}
            showFollowButton={false}
            isFollowing={false}
            onPress={() => {
              if (onProfilePress) {
                onProfilePress(profile);
              } else {
                prefetchProfileThenOpen(profile, queryClient, goToProfile);
              }
            }}
            backgroundColor={Colors.transparent}
            nameFontWeight="Figtree-SemiBold"
            customFontSize={18}
            style={styles.authorItemStyle}
          />
        );
      },
      [onProfilePress, queryClient, goToProfile]
    );

    if (isLoading) {
      return (
        <View style={styles.loadingContainerFull}>
          <ActivityIndicator size="large" color={Colors.neutral[50]} />
        </View>
      );
    }

    return (
      <FlashList
        data={profiles}
        keyExtractor={profile => `profile-${profile.did || profile.handle}`}
        renderItem={renderProfileItem}
        contentContainerStyle={[styles.listContainer, { paddingBottom: bottomPadding + 20 }]}
        showsVerticalScrollIndicator={
          profiles.length >= SCROLL_INDICATOR_CONSTANTS.SEARCH_RESULTS_MIN_ITEMS
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onEndReached={handleLoadMore}
        onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
        maintainVisibleContentPosition={{
          disabled: false,
          autoscrollToTopThreshold: undefined,
        }}
        ListEmptyComponent={renderEmptyProfiles}
      />
    );
  }
);
ProfilesFeedRenderer.displayName = 'ProfilesFeedRenderer';

const ChannelsFeedRenderer = React.memo(
  ({
    channels,
    isLoading,
    onChannelPress,
    bottomPadding = 0,
  }: {
    channels: CachedChannel[];
    isLoading?: boolean;
    onChannelPress?: (channel: CachedChannel) => void;
    bottomPadding?: number;
  }) => {
    const { t } = useTranslation();
    const { navigateToChannel: goToChannel } = useProfileChannelNavigation();

    const renderEmptyChannels = useCallback(
      () => (
        <View style={styles.emptyTabContent}>
          <Text style={styles.emptyTabText}>{t('feed.noFeedsFound')}</Text>
        </View>
      ),
      [t]
    );

    const renderChannelItem = useCallback(
      ({ item: channel }: { item: CachedChannel }) => {
        const slug = extractFeedSlug(channel.uri);
        return (
          <AuthorItem
            handle={slug || ''}
            did={channel.did}
            displayName={slug || channel.displayName}
            avatar={channel.avatar}
            size="large"
            showArrow={false}
            showFollowButton={false}
            isFollowing={false}
            showRing={false}
            rectangularAvatar={true}
            onPress={() => {
              if (onChannelPress) {
                onChannelPress(channel);
              } else {
                navigateToEncodedChannelUri(channel.uri, goToChannel);
              }
            }}
            backgroundColor={Colors.transparent}
            nameFontWeight="Figtree-SemiBold"
            customFontSize={18}
            style={styles.authorItemStyle}
          />
        );
      },
      [onChannelPress, goToChannel]
    );

    if (isLoading) {
      return (
        <View style={[styles.loadingContainer, styles.flexOne]}>
          <ActivityIndicator size="large" color={Colors.neutral[50]} />
        </View>
      );
    }

    return (
      <FlashList
        data={channels}
        keyExtractor={channel => `channel-${channel.uri || channel.cid}`}
        renderItem={renderChannelItem}
        contentContainerStyle={[styles.listContainer, { paddingBottom: bottomPadding + 20 }]}
        showsVerticalScrollIndicator={
          channels.length >= SCROLL_INDICATOR_CONSTANTS.SEARCH_RESULTS_MIN_ITEMS
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={renderEmptyChannels}
      />
    );
  }
);
ChannelsFeedRenderer.displayName = 'ChannelsFeedRenderer';

const RecentlyVisitedFeedRenderer = React.memo(
  ({
    profiles,
    channels,
    onProfilePress,
    onChannelPress,
    bottomPadding = 0,
  }: {
    profiles: ProfileViewWithOrbyt[];
    channels: CachedChannel[];
    onProfilePress?: (profile: ProfileViewWithOrbyt) => void;
    onChannelPress?: (channel: CachedChannel) => void;
    bottomPadding?: number;
  }) => {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { navigateToProfile: goToProfile, navigateToChannel: goToChannel } =
      useProfileChannelNavigation();

    const renderItem = useCallback(
      ({ item }: { item: ProfileViewWithOrbyt | CachedChannel }) => {
        const isProfile = 'handle' in item;
        const slug = !isProfile ? extractFeedSlug(item.uri) : null;
        const handle = isProfile ? item.handle : (slug || '');
        const displayName = isProfile ? item.displayName : (slug || item.displayName);
        const onPress = isProfile
          ? () => (onProfilePress ? onProfilePress(item) : prefetchProfileThenOpen(item, queryClient, goToProfile))
          : () => (onChannelPress ? onChannelPress(item) : navigateToEncodedChannelUri(item.uri, goToChannel));

        return (
          <AuthorItem
            key={isProfile ? item.did : item.uri}
            handle={handle || ''}
            did={isProfile ? item.did : item.did}
            displayName={displayName}
            avatar={isProfile ? item.avatar : item.avatar}
            size="large"
            showArrow={false}
            showFollowButton={false}
            isFollowing={false}
            showRing={isProfile}
            rectangularAvatar={!isProfile}
            onPress={onPress}
            backgroundColor={Colors.transparent}
            nameFontWeight="Figtree-SemiBold"
            customFontSize={18}
            style={styles.authorItemStyle}
          />
        );
      },
      [onProfilePress, onChannelPress, queryClient, goToProfile, goToChannel]
    );

    const renderEmpty = useCallback(
      () => (
        <View style={styles.emptyTabContent}>
          <Text style={styles.emptyTabText}>{t('feed.noRecentVisits')}</Text>
        </View>
      ),
      [t]
    );

    const combinedItems = [...profiles, ...channels];
    return (
      <View style={styles.flexOne}>
        <FlashList
          data={combinedItems}
          keyExtractor={(item) =>
            'handle' in item ? `p-${item.did}` : `c-${item.uri}`
          }
          renderItem={renderItem}
          contentContainerStyle={[styles.listContainer, { paddingBottom: bottomPadding + 20 }]}
          showsVerticalScrollIndicator={
            combinedItems.length >= SCROLL_INDICATOR_CONSTANTS.SEARCH_RESULTS_MIN_ITEMS
          }
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListEmptyComponent={renderEmpty}
        />
      </View>
    );
  }
);
RecentlyVisitedFeedRenderer.displayName = 'RecentlyVisitedFeedRenderer';

export const SearchFeedRenderer = React.memo(
  ({
    feedOption,
    profiles,
    channels,
    isLoading,
    onProfilePress,
    onChannelPress,
    recentlyVisitedProfiles,
    recentlyVisitedChannels,
    bottomPadding = 0,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  }: {
    feedOption: ExploreSearchTabId;
    profiles: ProfileViewWithOrbyt[];
    channels: CachedChannel[];
    isLoading?: boolean;
    onProfilePress?: (profile: ProfileViewWithOrbyt) => void;
    onChannelPress?: (channel: CachedChannel) => void;
    recentlyVisitedProfiles?: ProfileViewWithOrbyt[];
    recentlyVisitedChannels?: CachedChannel[];
    bottomPadding?: number;
    hasNextPage?: boolean;
    isFetchingNextPage?: boolean;
    fetchNextPage?: () => void;
  }) => {
    switch (feedOption) {
      case 'recently-visited':
        return (
          <RecentlyVisitedFeedRenderer
            profiles={recentlyVisitedProfiles || []}
            channels={recentlyVisitedChannels || []}
            onProfilePress={onProfilePress}
            onChannelPress={onChannelPress}
            bottomPadding={bottomPadding}
          />
        );
      case 'profiles':
        return (
          <ProfilesFeedRenderer
            profiles={profiles}
            isLoading={isLoading}
            onProfilePress={onProfilePress}
            bottomPadding={bottomPadding}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            fetchNextPage={fetchNextPage}
          />
        );
      case 'channels':
        return (
          <ChannelsFeedRenderer
            channels={channels}
            isLoading={isLoading}
            onChannelPress={onChannelPress}
            bottomPadding={bottomPadding}
          />
        );
      default: {
        const _exhaustive: never = feedOption;
        return _exhaustive;
      }
    }
  }
);
SearchFeedRenderer.displayName = 'SearchFeedRenderer';
