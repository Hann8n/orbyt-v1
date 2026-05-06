import { useMemo } from 'react';

import { useProfileByDid } from '../../../../../services/data/ProfileService';
import { useFollowStore } from '../../../../../stores/followStore';
import { isCurrentUser } from '../../../../../stores/profileInteractionStore';
import { getProfileColors, type ProfileColorScheme } from '../../../../../utils/formatting/colors';
import { getChannelBySlug } from '../../../../../utils/channels/orbyt';
import type { ExtendedPostView, StatusView } from '../../../../../services/api/types';
import type { UserState } from '../../../../../stores/userStore';

type CurrentUser = UserState['currentUser'];

export interface VideoCardAuthorOverlay {
  isAuthorBlocked: boolean;
  profileColors: ProfileColorScheme | null | undefined;
  authorDid: string | null | undefined;
  authorProfileStatus: StatusView | null | undefined;
}

export interface UseVideoCardAuthorArgs {
  postView: ExtendedPostView;
  currentUser: CurrentUser;
}

export interface UseVideoCardAuthorResult {
  cachedProfile: ReturnType<typeof useProfileByDid>['data'];
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
  const { data: cachedProfile } = useProfileByDid(postView.author?.did);
  const authorDid = cachedProfile?.did || postView.author?.did;
  const storeIsFollowing = useFollowStore(state =>
    authorDid ? state.follows.get(authorDid)?.isFollowing : undefined
  );
  const isFollowing = !!(cachedProfile?.viewer?.following || storeIsFollowing);
  const hasProfile = !!cachedProfile;

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
      isAuthorBlocked: !!(cachedProfile?.viewer?.blocking || cachedProfile?.viewer?.blockingByList),
      profileColors,
      authorDid,
      authorProfileStatus: cachedProfile?.status,
    }),
    [
      cachedProfile?.viewer?.blocking,
      cachedProfile?.viewer?.blockingByList,
      profileColors,
      authorDid,
      cachedProfile?.status,
    ]
  );

  const postRecord = postView.record as { tags?: string[] } | undefined;
  const channelTag = (postRecord?.tags ?? []).find(
    (t): t is string => typeof t === 'string' && t.startsWith('orbyt-channel-')
  );
  const channelSlug = channelTag ? channelTag.replace(/^orbyt-channel-/, '') || null : null;
  const channelUri = channelSlug ? (getChannelBySlug(channelSlug)?.uri ?? null) : null;

  const isCurrentUserProfile = useMemo(
    () => isCurrentUser(postView.author?.did, postView.author?.handle, currentUser),
    [postView.author?.did, postView.author?.handle, currentUser]
  );

  return {
    cachedProfile,
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
