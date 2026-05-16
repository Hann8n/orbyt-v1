import { AppBskyActorDefs, AppBskyFeedPost } from '@atproto/api';

import { useProfileByDid } from '../../../../../services/data/ProfileService';
import { isCurrentUser } from '../../../../../utils/atproto/isCurrentUser';
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

export function useVideoCardAuthor({
  postView,
  currentUser,
}: UseVideoCardAuthorArgs): UseVideoCardAuthorResult {
  const author = postView.author;
  const { data: cachedProfile } = useProfileByDid(author?.did);
  const authorDid = author?.did;

  // Prefer React Query cache for follow/block state — mutations update the cache optimistically,
  // so the feed post's viewer fields can be stale after an in-session follow/block.
  const isFollowing = !!(cachedProfile?.viewer?.following ?? author?.viewer?.following);
  const hasProfile = !!author;

  const orbytBgColor = cachedProfile?.orbytColors?.backgroundColor;
  const orbytTextColor = cachedProfile?.orbytColors?.textColor;
  const profileColors = getProfileColors(
    orbytBgColor !== undefined
      ? { orbytColors: { backgroundColor: orbytBgColor, textColor: orbytTextColor ?? '' } }
      : null
  );

  const authorProfileOverlay: VideoCardAuthorOverlay = {
    isAuthorBlocked: !!(
      (cachedProfile?.viewer?.blocking ?? author?.viewer?.blocking) ||
      (cachedProfile?.viewer?.blockingByList ?? author?.viewer?.blockingByList)
    ),
    profileColors,
    authorDid,
    authorProfileStatus: author?.status ?? undefined,
    verification: author?.verification,
  };

  const postRecord = postView.record as AppBskyFeedPost.Record;
  const channelTag = (postRecord.tags ?? []).find(t => t.startsWith('orbyt-channel-'));
  const channelSlug = channelTag ? channelTag.replace(/^orbyt-channel-/, '') || null : null;
  const channelUri = channelSlug ? (getChannelBySlug(channelSlug)?.uri ?? null) : null;

  const isCurrentUserProfile = isCurrentUser(author?.did, author?.handle, currentUser);

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
