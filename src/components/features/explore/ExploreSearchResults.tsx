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
import { type ExploreSearchTabId } from './types';
import { prefetchProfileThenOpen } from './prefetchProfileThenOpen';
import { exploreScreenStyles as styles } from './ExploreScreenStyles';

type ExploreSuggestionsProfileRowProps = {
  profile: ProfileViewWithOrbyt;
  queryClient: QueryClient;
  goToProfile: (did: string) => void;
  onFollow?: (profile: ProfileViewWithOrbyt) => void;
};

export const ExploreSuggestionsProfileRow = ({
  profile,
  queryClient,
  goToProfile,
  onFollow,
}: ExploreSuggestionsProfileRowProps) => {
  const isFollowing = !!profile.viewer?.following;

  return (
    <AuthorItem
      handle={profile.handle || ''}
      did={profile.did}
      avatar={profile.avatar}
      size="large"
      showArrow={false}
      showFollowButton={!isFollowing}
      isFollowing={isFollowing}
      onFollowPress={onFollow ? () => onFollow(profile) : undefined}
      onPress={() => prefetchProfileThenOpen(profile, queryClient, goToProfile)}
      backgroundColor={Colors.transparent}
      textColor={Colors.neutral[50]}
      nameFontWeight="Figtree-Bold"
      handleAsDisplayName
      style={styles.authorItemStyle}
    />
  );
};
ExploreSuggestionsProfileRow.displayName = 'ExploreSuggestionsProfileRow';

const ProfilesFeedRenderer = ({
  profiles,
  isLoading,
  onProfilePress: _onProfilePress,
  onFollow,
  bottomPadding = 0,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: {
  profiles: ProfileViewWithOrbyt[];
  isLoading?: boolean;
  onProfilePress?: (profile: ProfileViewWithOrbyt) => void;
  onFollow?: (profile: ProfileViewWithOrbyt) => void;
  bottomPadding?: number;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { navigateToProfile: goToProfile } = useProfileChannelNavigation();

  const handleLoadMore = () => {
    if (hasNextPage && !isFetchingNextPage && fetchNextPage) {
      fetchNextPage();
    }
  };

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
      renderItem={({ item: profile }) => (
        <ExploreSuggestionsProfileRow
          profile={profile}
          queryClient={queryClient}
          goToProfile={goToProfile}
          onFollow={onFollow}
        />
      )}
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
      ListEmptyComponent={() => (
        <View style={styles.emptyTabContent}>
          <Text style={styles.emptyTabText}>{t('feed.noPeopleFound')}</Text>
        </View>
      )}
    />
  );
};
ProfilesFeedRenderer.displayName = 'ProfilesFeedRenderer';

/** Community and feed results: the same rows, each opening its channel screen. */
const ChannelsFeedRenderer = ({
  channels,
  isLoading,
  onChannelPress,
  bottomPadding = 0,
  emptyText,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: {
  channels: CachedChannel[];
  isLoading?: boolean;
  onChannelPress?: (channel: CachedChannel) => void;
  bottomPadding?: number;
  emptyText: string;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;
}) => {
  const { navigateToChannel: goToChannel } = useProfileChannelNavigation();

  const handleLoadMore = () => {
    if (hasNextPage && !isFetchingNextPage && fetchNextPage) {
      fetchNextPage();
    }
  };

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
      renderItem={({ item: channel }) => {
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
            rectangularAvatar={true}
            onPress={() =>
              onChannelPress
                ? onChannelPress(channel)
                : navigateToEncodedChannelUri(channel.uri, goToChannel)
            }
            backgroundColor={Colors.transparent}
            nameFontWeight="Figtree-Bold"
            style={styles.authorItemStyle}
          />
        );
      }}
      contentContainerStyle={[styles.listContainer, { paddingBottom: bottomPadding + 20 }]}
      showsVerticalScrollIndicator={
        channels.length >= SCROLL_INDICATOR_CONSTANTS.SEARCH_RESULTS_MIN_ITEMS
      }
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      onEndReached={handleLoadMore}
      onEndReachedThreshold={QUERY_CONSTANTS.END_REACHED_THRESHOLD}
      ListEmptyComponent={() => (
        <View style={styles.emptyTabContent}>
          <Text style={styles.emptyTabText}>{emptyText}</Text>
        </View>
      )}
    />
  );
};
ChannelsFeedRenderer.displayName = 'ChannelsFeedRenderer';

const RecentlyVisitedFeedRenderer = ({
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

  const combinedItems = [...profiles, ...channels];
  return (
    <View style={styles.flexOne}>
      <FlashList
        data={combinedItems}
        keyExtractor={item => ('handle' in item ? `p-${item.did}` : `c-${item.uri}`)}
        renderItem={({ item }) => {
          const isProfile = 'handle' in item;
          const slug = !isProfile ? extractFeedSlug(item.uri) : null;
          const handle = isProfile ? item.handle : slug || '';
          const displayName = isProfile ? undefined : slug || item.displayName;
          const onPress = isProfile
            ? () =>
                onProfilePress
                  ? onProfilePress(item)
                  : prefetchProfileThenOpen(item, queryClient, goToProfile)
            : () =>
                onChannelPress
                  ? onChannelPress(item)
                  : navigateToEncodedChannelUri(item.uri, goToChannel);

          return (
            <AuthorItem
              handle={handle || ''}
              did={isProfile ? item.did : item.did}
              displayName={displayName}
              avatar={isProfile ? item.avatar : item.avatar}
              size="large"
              showArrow={false}
              showFollowButton={false}
              isFollowing={false}
              rectangularAvatar={!isProfile}
              handleAsDisplayName={isProfile}
              onPress={onPress}
              backgroundColor={Colors.transparent}
              nameFontWeight="Figtree-Bold"
              style={styles.authorItemStyle}
            />
          );
        }}
        contentContainerStyle={[styles.listContainer, { paddingBottom: bottomPadding + 20 }]}
        showsVerticalScrollIndicator={
          combinedItems.length >= SCROLL_INDICATOR_CONSTANTS.SEARCH_RESULTS_MIN_ITEMS
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={() => (
          <View style={styles.emptyTabContent}>
            <Text style={styles.emptyTabText}>{t('feed.noRecentVisits')}</Text>
          </View>
        )}
      />
    </View>
  );
};
RecentlyVisitedFeedRenderer.displayName = 'RecentlyVisitedFeedRenderer';

export const SearchFeedRenderer = ({
  feedOption,
  profiles,
  communities,
  feeds,
  isLoading,
  isCommunitiesLoading,
  onProfilePress,
  onChannelPress,
  onFollow,
  recentlyVisitedProfiles,
  recentlyVisitedChannels,
  bottomPadding = 0,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  hasMoreCommunities,
  isFetchingMoreCommunities,
  fetchMoreCommunities,
}: {
  feedOption: ExploreSearchTabId;
  profiles: ProfileViewWithOrbyt[];
  /** Orbyt Communities matching the search. */
  communities: CachedChannel[];
  /** Bluesky feed generators matching the search. */
  feeds: CachedChannel[];
  isLoading?: boolean;
  isCommunitiesLoading?: boolean;
  onProfilePress?: (profile: ProfileViewWithOrbyt) => void;
  onChannelPress?: (channel: CachedChannel) => void;
  onFollow?: (profile: ProfileViewWithOrbyt) => void;
  recentlyVisitedProfiles?: ProfileViewWithOrbyt[];
  recentlyVisitedChannels?: CachedChannel[];
  bottomPadding?: number;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;
  hasMoreCommunities?: boolean;
  isFetchingMoreCommunities?: boolean;
  fetchMoreCommunities?: () => void;
}) => {
  const { t } = useTranslation();
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
          onFollow={onFollow}
          bottomPadding={bottomPadding}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          fetchNextPage={fetchNextPage}
        />
      );
    case 'channels':
      return (
        <ChannelsFeedRenderer
          channels={communities}
          isLoading={isCommunitiesLoading}
          onChannelPress={onChannelPress}
          bottomPadding={bottomPadding}
          emptyText={t('feed.noChannelsFound')}
          hasNextPage={hasMoreCommunities}
          isFetchingNextPage={isFetchingMoreCommunities}
          fetchNextPage={fetchMoreCommunities}
        />
      );
    case 'feeds':
      return (
        <ChannelsFeedRenderer
          channels={feeds}
          isLoading={isLoading}
          onChannelPress={onChannelPress}
          bottomPadding={bottomPadding}
          emptyText={t('feed.noFeedsFound')}
        />
      );
    default: {
      const _exhaustive: never = feedOption;
      return _exhaustive;
    }
  }
};
SearchFeedRenderer.displayName = 'SearchFeedRenderer';
