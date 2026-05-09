import { memo, useMemo } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { VideoOverlayActions } from './video-overlay/VideoOverlayActions';
import { VideoOverlayAuthor } from './video-overlay/VideoOverlayAuthor';
import { VideoOverlayCaption } from './video-overlay/VideoOverlayCaption';
import type { ProfileColorScheme } from '../../../utils/formatting/colors';
import type {
  ExtendedPostView,
  ProfileViewWithOrbyt,
  StatusView,
} from '../../../services/api/types';

const GRADIENT_SHIM = require('../../../assets/embed-video-gradient-shim.png');

type Post = ExtendedPostView;

export interface VideoOverlayUIProps {
  post: Post;
  sourceFeed?: string;
  /** Composed scroll-overlap × scrubbing opacity from VideoCard. */
  overlayOpacitySV?: SharedValue<number>;
  /** Fires when the description text collapses/expands (collapsed = 1 line). */
  onOverlayCollapsedChange?: (isCollapsed: boolean) => void;
  onLike?: () => void;
  onRepost?: () => void;
  isLiked?: boolean;
  isReposted?: boolean;
  likeCount?: number;
  commentCount?: number;
  repostCount?: number;
  isLikePending?: boolean;
  isRepostPending?: boolean;
  isFollowing?: boolean;
  hasProfile?: boolean;
  isCurrentUserProfile?: boolean;
  channelSlug?: string | null;
  onChannelPress?: () => void;
  onAuthorPress?: (
    identifier: string,
    data?: { did?: string; handle?: string; displayName?: string; avatar?: string }
  ) => void;
  onRepostAuthorPress?: () => void;
  onOpenComments?: () => void;
  onSharePress?: () => void;
  onFollowPress?: () => void;
  onHashtagPress?: (hashtag: string) => void;
  /** From VideoCard's single useProfile (avoids duplicate useProfile in overlay). */
  authorProfileOverlay?: {
    isAuthorBlocked: boolean;
    profileColors: ProfileColorScheme | null | undefined;
    authorDid: string | null | undefined;
    authorProfileStatus: StatusView | null | undefined;
    /** Verification slice from the by-DID profile cache. Threaded inline so
     *  VerificationBadge can skip its own per-card `useProfile(handle)` query. */
    verification: ProfileViewWithOrbyt['verification'];
  };
}

/**
 * Thin layout wrapper for the social chrome that floats over a video card.
 * The previous monolith (910 lines, single memo, 22-prop comparator) is now
 * a router that composes three independently-memoized children:
 *
 * - VideoOverlayCaption : description + show-more / show-less
 * - VideoOverlayAuthor  : avatar, handle, badges, follow CTA, channel chip
 * - VideoOverlayActions : like / repost / comment / share rail
 *
 * A like that fires only invalidates VideoOverlayActions for that one card —
 * the author + caption subtrees and every other card's overlay stay stable.
 */
function VideoOverlayUI({
  post,
  overlayOpacitySV,
  onOverlayCollapsedChange,
  onLike,
  onRepost,
  isLiked = false,
  isReposted = false,
  likeCount = 0,
  commentCount = 0,
  repostCount = 0,
  isLikePending = false,
  isRepostPending = false,
  isFollowing = false,
  hasProfile = false,
  isCurrentUserProfile = false,
  channelSlug,
  onChannelPress,
  onAuthorPress,
  onRepostAuthorPress,
  onOpenComments,
  onSharePress,
  onFollowPress,
  onHashtagPress,
  authorProfileOverlay,
}: VideoOverlayUIProps) {
  const { width } = useWindowDimensions();

  const { contentPadding, actionIconSize, authorAvatarSize, moreMenuIconSize } = useMemo(() => {
    const padding = Math.round(Math.max(8, Math.min(14, width * 0.025)));
    const iconSize = Math.round(Math.max(28, Math.min(40, width * 0.085)));
    return {
      contentPadding: padding,
      actionIconSize: iconSize,
      authorAvatarSize: Math.round(Math.max(46, Math.min(64, width * 0.12))),
      moreMenuIconSize: Math.max(Math.round(iconSize * 0.68), 18),
    };
  }, [width]);

  const overlayContentStyle = useMemo(
    () => [
      styles.overlayContentContainer,
      {
        paddingHorizontal: contentPadding,
        paddingTop: contentPadding,
        paddingBottom: contentPadding,
      },
    ],
    [contentPadding]
  );

  const overlayAnimatedStyle = useAnimatedStyle(() => {
    const opacityValue = overlayOpacitySV ? overlayOpacitySV.value : 1;
    return { opacity: opacityValue };
  });
  const overlayContainerStyle = useMemo(
    () => StyleSheet.compose(styles.overlayContainer, overlayAnimatedStyle),
    [overlayAnimatedStyle]
  );

  const isAuthorBlocked = authorProfileOverlay?.isAuthorBlocked ?? false;
  const profileColors = authorProfileOverlay?.profileColors;
  const authorProfileStatus = authorProfileOverlay?.authorProfileStatus;
  const authorVerification = authorProfileOverlay?.verification;

  return (
    <Animated.View style={overlayContainerStyle} pointerEvents="box-none">
      <Image
        source={GRADIENT_SHIM}
        style={styles.gradientShimTop}
        contentFit="cover"
        pointerEvents="none"
        accessible={false}
      />
      <Image
        source={GRADIENT_SHIM}
        style={styles.gradientShim}
        contentFit="cover"
        pointerEvents="none"
        accessible={false}
      />
      <View style={overlayContentStyle} pointerEvents="box-none">
        <View style={styles.infoColumn} pointerEvents="box-none">
          <VideoOverlayAuthor
            post={post}
            isFollowing={isFollowing}
            hasProfile={hasProfile}
            isCurrentUserProfile={isCurrentUserProfile}
            channelSlug={channelSlug}
            authorAvatarSize={authorAvatarSize}
            isAuthorBlocked={isAuthorBlocked}
            authorProfileStatus={authorProfileStatus}
            profileColors={profileColors}
            verification={authorVerification}
            onAuthorPress={onAuthorPress}
            onRepostAuthorPress={onRepostAuthorPress}
            onChannelPress={onChannelPress}
            onFollowPress={onFollowPress}
          />
          <VideoOverlayCaption
            post={post}
            onAuthorPress={onAuthorPress}
            onHashtagPress={onHashtagPress}
            onOverlayCollapsedChange={onOverlayCollapsedChange}
          />
        </View>

        <VideoOverlayActions
          postUri={post.uri}
          isLiked={isLiked}
          isReposted={isReposted}
          likeCount={likeCount}
          commentCount={commentCount}
          repostCount={repostCount}
          isLikePending={isLikePending}
          isRepostPending={isRepostPending}
          actionIconSize={actionIconSize}
          moreMenuIconSize={moreMenuIconSize}
          onLike={onLike}
          onRepost={onRepost}
          onOpenComments={onOpenComments}
          onSharePress={onSharePress}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  gradientShimTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 220,
    opacity: 0.5,
  },
  gradientShim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 280,
    transform: [{ scaleY: -1 }],
    opacity: 0.92,
  },
  overlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    // Above scrubber (z 10) so overlay hitboxes (avatar, handle, actions) are tappable.
    zIndex: 12,
  },
  overlayContentContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 14,
    zIndex: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  infoColumn: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'flex-end',
    gap: 6,
    marginBottom: 0,
  },
});

// Outer memo barrier on the wrapper. Children own their own memo boundaries; this comparator
// only needs to gate identity changes that the children would all read.
const arePropsEqual = (prev: VideoOverlayUIProps, next: VideoOverlayUIProps): boolean => {
  if (prev.post?.uri !== next.post?.uri) return false;

  if (prev.isLiked !== next.isLiked) return false;
  if (prev.isReposted !== next.isReposted) return false;
  if (prev.likeCount !== next.likeCount) return false;
  if (prev.commentCount !== next.commentCount) return false;
  if (prev.repostCount !== next.repostCount) return false;
  if (prev.isLikePending !== next.isLikePending) return false;
  if (prev.isRepostPending !== next.isRepostPending) return false;

  if (prev.isFollowing !== next.isFollowing) return false;
  if (prev.hasProfile !== next.hasProfile) return false;
  if (prev.isCurrentUserProfile !== next.isCurrentUserProfile) return false;
  if (prev.channelSlug !== next.channelSlug) return false;

  if (prev.sourceFeed !== next.sourceFeed) return false;
  if (prev.overlayOpacitySV !== next.overlayOpacitySV) return false;

  if (prev.onLike !== next.onLike) return false;
  if (prev.onRepost !== next.onRepost) return false;
  if (prev.onOverlayCollapsedChange !== next.onOverlayCollapsedChange) return false;
  if (prev.onChannelPress !== next.onChannelPress) return false;
  if (prev.onAuthorPress !== next.onAuthorPress) return false;
  if (prev.onRepostAuthorPress !== next.onRepostAuthorPress) return false;
  if (prev.onOpenComments !== next.onOpenComments) return false;
  if (prev.onSharePress !== next.onSharePress) return false;
  if (prev.onFollowPress !== next.onFollowPress) return false;
  if (prev.onHashtagPress !== next.onHashtagPress) return false;

  const prevOverlay = prev.authorProfileOverlay;
  const nextOverlay = next.authorProfileOverlay;
  if ((prevOverlay?.isAuthorBlocked ?? false) !== (nextOverlay?.isAuthorBlocked ?? false))
    return false;
  if ((prevOverlay?.authorDid ?? null) !== (nextOverlay?.authorDid ?? null)) return false;
  if (prevOverlay?.authorProfileStatus !== nextOverlay?.authorProfileStatus) return false;
  if (prevOverlay?.profileColors !== nextOverlay?.profileColors) return false;
  if (prevOverlay?.verification !== nextOverlay?.verification) return false;

  return true;
};

export default memo(VideoOverlayUI, arePropsEqual);
