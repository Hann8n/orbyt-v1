import { useMemo } from 'react';
import { AppBskyActorDefs, AppBskyFeedPost } from '@atproto/api';

import { useProfileByDid } from '../../../../../services/data/ProfileService';
import { useFollowStore } from '../../../../../stores/followStore';
import { isCurrentUser } from '../../../../../stores/profileInteractionStore';
import { getProfileColors, type ProfileColorScheme } from '../../../../../utils/formatting/colors';
import { getChannelBySlug } from '../../../../../utils/channels/orbyt';
import type { ExtendedPostView } from '../../../../../services/api/types';
import type { UserState } from '../../../../../stores/userStore';

type CurrentUser = UserState['currentUser'];

export interface VideoCardAuthorOverlay {
  isAuthorBlocked: boolean;
  profileColors: ProfileColorScheme | null | undefined;
  authorDid: string | null | undefined;
  authorProfileStatus: AppBskyActorDefs.StatusView | null | undefined;
  verification: AppBskyActorDefs.VerificationState | undefined;
}

export interface UseVideoCardAuthorArgs {
  postView: ExtendedPostView;
  currentUser: CurrentUser;
}

export interface UseVideoCardAuthorResult {
  hasProfile: boolean;
  isFollowing: boolean;
  authorDid: string | null | undefined;
  profileColors: ProfileColorScheme;
  authorProfileOverlay: VideoCardAuthorOverlay;
  channelSlug: string | null;
  channelUri: string | null;
  isCurrentUserProfile: boolean;
}

/**
 * Read-only author/profile data the overlay needs in one place: profile cache,
 * follow flag, computed colour scheme, channel slug from post tags, and
 * current-user check. Returning a single overlay object keeps the prop bag
 * passed down stable across renders.
 */
export function useVideoCardAuthor({
  postView,
  currentUser,
}: UseVideoCardAuthorArgs): UseVideoCardAuthorResult {
  const author = postView.author;
  const { data: cachedProfile } = useProfileByDid(author?.did);
  const authorDid = author?.did;
  const storeIsFollowing = useFollowStore(state =>
    authorDid ? state.follows.get(authorDid)?.isFollowing : undefined
  );
  // The feed response already includes viewer.following on the author
  // (ProfileViewBasic has a viewer field per the AT Protocol SDK).
  // Use it as the synchronous baseline; the follow store provides
  // optimistic updates after the user presses follow/unfollow.
  const feedIsFollowing = !!author?.viewer?.following;
  const isFollowing =
    storeIsFollowing !== undefined ? storeIsFollowing : feedIsFollowing;
  const hasProfile = !!author;

  const orbytBgColor = cachedProfile?.orbytColors?.backgroundColor;
  const orbytTextColor = cachedProfile?.orbytColors?.textColor;
  const profileColors = useMemo(
    () =>
      getProfileColors(
        orbytBgColor !== undefined
          ? { orbytColors: { backgroundColor: orbytBgColor, textColor: orbytTextColor ?? '' } }
          : null
      ),
    [orbytBgColor, orbytTextColor]
  );

  const authorProfileOverlay = useMemo<VideoCardAuthorOverlay>(
    () => ({
      // All of these fields are on ProfileViewBasic.viewer, which the
      // AppView already embeds in every feed response (no extra fetch needed).
      isAuthorBlocked: !!(author?.viewer?.blocking || author?.viewer?.blockingByList),
      profileColors,
      authorDid,
      authorProfileStatus: author?.status ?? undefined,
      verification: author?.verification,
    }),
    [
      author?.viewer?.blocking,
      author?.viewer?.blockingByList,
      profileColors,
      authorDid,
      author?.status,
      author?.verification,
    ]
  );

  const postRecord = postView.record as AppBskyFeedPost.Record;
  const channelTag = (postRecord.tags ?? []).find(t => t.startsWith('orbyt-channel-'));
  const channelSlug = channelTag ? channelTag.replace(/^orbyt-channel-/, '') || null : null;
  const channelUri = channelSlug ? (getChannelBySlug(channelSlug)?.uri ?? null) : null;

  const isCurrentUserProfile = useMemo(
    () => isCurrentUser(author?.did, author?.handle, currentUser),
    [author?.did, author?.handle, currentUser]
  );

  return {
    hasProfile,
    isFollowing,
    authorDid,
    profileColors,
    authorProfileOverlay,
    channelSlug,
    channelUri,
    isCurrentUserProfile,
  };
}
