import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { QUERY_CONSTANTS, SCROLL_INDICATOR_CONSTANTS } from '@/utils/constants';
import { Colors } from '@/theme';
import AuthorItem from '@/components/ui/AuthorItem';
import ChannelItem from '@/components/ui/ChannelItem';
import type { ProfileViewWithOrbyt } from '@/services/api/types';
import type { CachedChannel } from '@/services/data/ChannelService';
import { useProfileChannelNavigation } from '@/hooks/useProfileChannelNavigation';
import type { VisitHistoryEntry } from '@/hooks/useVisitHistory';
import { navigateToEncodedChannelUri } from '@/utils/navigation/navigateEncodedChannel';

import {
  type Channel,
  type ExploreSearchTabId,
  type Profile,
  type SearchResult,
  isChannelResult,
  isProfileResult,
} from './types';
import { prefetchProfileThenOpen } from './prefetchProfileThenOpen';
import { exploreScreenStyles as styles } from './ExploreScreenStyles';

function dedupeSearchResultProfiles(results: SearchResult[]): Profile[] {
  const seen = new Set<string>();
  const deduped: Profile[] = [];

  for (const result of results) {
    if (!isProfileResult(result)) continue;
    const profile = result.data;
    const key = profile.did || profile.handle;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(profile);
  }

  return deduped;
}

function dedupeSearchResultChannels(results: SearchResult[]): Channel[] {
  const seen = new Set<string>();
  const deduped: Channel[] = [];

  for (const result of results) {
    if (!isChannelResult(result)) continue;
    const channel = result.data;
    const key = channel.uri || channel.cid;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(channel);
  }

  return deduped;
}

const noopVisitHistoryPress = (_item: VisitHistoryEntry) => {};

type ExploreSuggestionsProfileRowProps = {
  profile: Profile;
  queryClient: QueryClient;
  goToProfile: (did: string) => void;
  onFollow: (profile: Profile) => void;
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
    searchResults,
    onFollow,
    isLoading,
    onProfilePress,
    bottomPadding = 0,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  }: {
    searchResults: SearchResult[];
    onFollow: (profile: Profile) => void;
    isLoading?: boolean;
    onProfilePress?: (profile: Profile) => void;
    bottomPadding?: number;
    hasNextPage?: boolean;
    isFetchingNextPage?: boolean;
    fetchNextPage?: () => void;
  }) => {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { navigateToProfile: goToProfile } = useProfileChannelNavigation();

    const profiles = useMemo(() => dedupeSearchResultProfiles(searchResults), [searchResults]);

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
      ({ item: profile }: { item: Profile }) => {
        const isFollowing = !!profile.viewer?.following;

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
            onFollowPress={() => onFollow(profile)}
            onPress={() => {
              if (onProfilePress) {
                onProfilePress(profile);
              } else {
                prefetchProfileThenOpen(profile, queryClient, goToProfile);
              }
            }}
            backgroundColor={Colors.transparent}
            textColor={Colors.neutral[50]}
            nameFontWeight="Figtree-SemiBold"
            skipServerProfileData
            style={styles.authorItemStyle}
          />
        );
      },
      [onFollow, onProfilePress, queryClient, goToProfile]
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
    searchResults,
    isLoading,
    onChannelPress,
    bottomPadding = 0,
  }: {
    searchResults: SearchResult[];
    isLoading?: boolean;
    onChannelPress?: (channel: Channel) => void;
    bottomPadding?: number;
  }) => {
    const { t } = useTranslation();
    const { navigateToChannel: goToChannel } = useProfileChannelNavigation();

    const channels = useMemo(() => dedupeSearchResultChannels(searchResults), [searchResults]);

    const renderEmptyChannels = useCallback(
      () => (
        <View style={styles.emptyTabContent}>
          <Text style={styles.emptyTabText}>{t('feed.noFeedsFound')}</Text>
        </View>
      ),
      [t]
    );

    const renderChannelItem = useCallback(
      ({ item: channel }: { item: Channel }) => (
        <ChannelItem
          uri={channel.uri}
          displayName={channel.displayName}
          avatar={channel.avatar}
          size="large"
          showArrow={false}
          onPress={() => {
            if (onChannelPress) {
              onChannelPress(channel);
            } else {
              navigateToEncodedChannelUri(channel.uri, goToChannel);
            }
          }}
          backgroundColor={Colors.transparent}
          textColor={Colors.neutral[50]}
          nameFontWeight="Figtree-Bold"
          style={styles.channelItemStyle}
        />
      ),
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

const VisitHistoryList = React.memo(
  ({
    visitHistory,
    onHistoryItemPress,
    onFollow,
    bottomPadding = 0,
    profilesByDid,
    channelsByUri,
  }: {
    visitHistory: VisitHistoryEntry[];
    onHistoryItemPress: (item: VisitHistoryEntry) => void;
    onFollow: (profile: Profile) => void;
    bottomPadding?: number;
    profilesByDid: Map<string, ProfileViewWithOrbyt>;
    channelsByUri: Map<string, CachedChannel>;
  }) => {
    const { t } = useTranslation();

    const renderVisitHistoryEmpty = useCallback(
      () => (
        <View style={styles.emptyTabContent}>
          <Text style={styles.emptyTabText}>{t('feed.noRecentVisits')}</Text>
        </View>
      ),
      [t]
    );

    return (
      <FlashList
        data={visitHistory}
        keyExtractor={item => {
          if (item.type === 'profile') {
            return `history-profile-${item.did}`;
          } else {
            return `history-channel-${item.uri}`;
          }
        }}
        renderItem={({ item }) => {
          const isProfile = item.type === 'profile';
          const profileData = isProfile ? profilesByDid.get(item.did) : null;
          const channelData = !isProfile ? channelsByUri.get(item.uri) : null;

          if (isProfile && profileData) {
            const isFollowing = !!profileData.viewer?.following;

            return (
              <AuthorItem
                handle={profileData.handle || ''}
                did={profileData.did}
                displayName={profileData.displayName}
                avatar={profileData.avatar}
                size="large"
                showArrow={false}
                showFollowButton={!isFollowing}
                isFollowing={isFollowing}
                onFollowPress={() => onFollow(profileData as unknown as Profile)}
                onPress={() => onHistoryItemPress(item)}
                backgroundColor={Colors.transparent}
                textColor={Colors.neutral[50]}
                nameFontWeight="Figtree-SemiBold"
                style={styles.authorItemStyle}
              />
            );
          }

          if (isProfile && !profileData) {
            return (
              <AuthorItem
                handle=""
                did={item.did}
                displayName={t('feed.loading')}
                avatar={undefined}
                size="large"
                showArrow={false}
                showFollowButton={false}
                isFollowing={false}
                onFollowPress={undefined}
                onPress={() => onHistoryItemPress(item)}
                backgroundColor={Colors.transparent}
                textColor={Colors.neutral[50]}
                nameFontWeight="Figtree-SemiBold"
                style={styles.authorItemStyle}
              />
            );
          }

          if (!isProfile && channelData) {
            return (
              <ChannelItem
                uri={channelData.uri}
                displayName={channelData.displayName}
                avatar={channelData.avatar}
                size="large"
                showArrow={false}
                onPress={() => onHistoryItemPress(item)}
                backgroundColor={Colors.transparent}
                textColor={Colors.neutral[50]}
                nameFontWeight="Figtree-Bold"
                style={styles.channelItemStyle}
              />
            );
          }

          if (!isProfile && !channelData) {
            return (
              <ChannelItem
                uri={item.uri}
                displayName={t('feed.loading')}
                avatar={undefined}
                size="large"
                showArrow={false}
                onPress={() => onHistoryItemPress(item)}
                backgroundColor={Colors.transparent}
                textColor={Colors.neutral[50]}
                nameFontWeight="Figtree-Bold"
                style={styles.channelItemStyle}
              />
            );
          }
          return null;
        }}
        contentContainerStyle={[styles.listContainer, { paddingBottom: bottomPadding + 20 }]}
        showsVerticalScrollIndicator={
          visitHistory.length >= SCROLL_INDICATOR_CONSTANTS.SEARCH_RESULTS_MIN_ITEMS
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={renderVisitHistoryEmpty}
      />
    );
  }
);
VisitHistoryList.displayName = 'VisitHistoryList';

export const SearchFeedRenderer = React.memo(
  ({
    feedOption,
    searchResults,
    onFollow,
    isLoading,
    onProfilePress,
    onChannelPress,
    visitHistory,
    onHistoryItemPress,
    profilesByDid,
    channelsByUri,
    bottomPadding = 0,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  }: {
    feedOption: ExploreSearchTabId;
    searchResults: SearchResult[];
    onFollow: (profile: Profile) => void;
    isLoading?: boolean;
    onProfilePress?: (profile: Profile) => void;
    onChannelPress?: (channel: Channel) => void;
    visitHistory?: VisitHistoryEntry[];
    onHistoryItemPress?: (item: VisitHistoryEntry) => void;
    profilesByDid?: Map<string, ProfileViewWithOrbyt>;
    channelsByUri?: Map<string, CachedChannel>;
    bottomPadding?: number;
    hasNextPage?: boolean;
    isFetchingNextPage?: boolean;
    fetchNextPage?: () => void;
  }) => {
    switch (feedOption) {
      case 'recently-visited':
        return (
          <VisitHistoryList
            visitHistory={visitHistory || []}
            onHistoryItemPress={onHistoryItemPress ?? noopVisitHistoryPress}
            onFollow={onFollow}
            bottomPadding={bottomPadding}
            profilesByDid={profilesByDid || new Map()}
            channelsByUri={channelsByUri || new Map()}
          />
        );
      case 'profiles':
        return (
          <ProfilesFeedRenderer
            searchResults={searchResults}
            onFollow={onFollow}
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
            searchResults={searchResults}
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
