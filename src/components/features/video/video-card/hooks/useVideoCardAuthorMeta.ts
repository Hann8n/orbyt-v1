import { useProfile } from '../../../../../services/data/ProfileService';
import { useFollowStore } from '../../../../../stores/followStore';
import { getChannelBySlug } from '../../../../../utils/channels/orbyt';
import { getProfileColors } from '../../../../../utils/formatting/colors';
import type { ExtendedPostView } from '../../../../../services/api/types';
import type { VideoOverlayUIProps } from '../../VideoOverlayUI';

export interface VideoCardAuthorMetaResult {
  isFollowing: boolean;
  hasProfile: boolean;
  authorProfileOverlay: NonNullable<VideoOverlayUIProps['authorProfileOverlay']>;
  channelSlug: string | null;
  channelUri: string | null;
}

export function useVideoCardAuthorMeta(postView: ExtendedPostView): VideoCardAuthorMetaResult {
  const { data: cachedProfile } = useProfile(postView.author?.handle);
  const authorDid = cachedProfile?.did || postView.author?.did;

  const storeIsFollowing = useFollowStore(state =>
    authorDid ? state.follows.get(authorDid)?.isFollowing : undefined
  );

  const isFollowing = !!(cachedProfile?.viewer?.following || storeIsFollowing);
  const hasProfile = !!cachedProfile;

  const authorProfileOverlay = {
    isAuthorBlocked: !!(cachedProfile?.viewer?.blocking || cachedProfile?.viewer?.blockingByList),
    profileColors: getProfileColors(cachedProfile?.orbytColors ?? cachedProfile),
    authorDid,
    authorProfileStatus: cachedProfile?.status,
  };

  const record = postView.record as { tags?: string[] };
  const tags = record?.tags || [];
  const channelTag = Array.isArray(tags)
    ? tags.find((tag: string) => typeof tag === 'string' && tag.startsWith('orbyt-channel-'))
    : undefined;

  const channelSlug = channelTag ? channelTag.replace(/^orbyt-channel-/, '') || null : null;
  const channelUri = channelSlug ? (getChannelBySlug(channelSlug)?.uri ?? null) : null;

  return {
    isFollowing,
    hasProfile,
    authorProfileOverlay,
    channelSlug,
    channelUri,
  };
}
