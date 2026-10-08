import { AppBskyActorDefs } from '@atproto/api';

import { useProfileByDid } from '../../../../../services/data/ProfileService';
import { useOrbytProfile } from '../../../../../services/colors';
import { isCurrentUser } from '../../../../../utils/atproto/isCurrentUser';
import { getProfileColors, type ProfileColorScheme } from '../../../../../utils/formatting/colors';
import { getChannelByUri } from '../../../../../utils/channels/orbyt';
import { usePostCommunity } from '../../../../../services/orbyt/postCommunities';
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
  const { data: orbytRecord } = useOrbytProfile(author?.did);
  const { data: postCommunityUri } = usePostCommunity(postView.uri);
  const authorDid = author?.did;

  // Prefer React Query cache for follow/block state — mutations update the cache optimistically,
  // so the feed post's viewer fields can be stale after an in-session follow/block.
  const isFollowing = !!(cachedProfile?.viewer?.following ?? author?.viewer?.following);
  const hasProfile = !!author;

  const profileColors = getProfileColors(orbytRecord?.colors ?? null);

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

  // The AppView resolves a post's Community (link record first, legacy tag second).
  const community = postCommunityUri ? getChannelByUri(postCommunityUri) : undefined;
  const channelUri = community?.uri ?? null;
  const channelSlug = community?.slug ?? null;

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
