import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import type { VideoPlayer } from 'expo-video';
import { VideoScrubber } from '../VideoScrubber';
import VideoOverlayUI, { type VideoOverlayUIProps } from '../VideoOverlayUI';
import VideoCardContentWarningLayer from './VideoCardContentWarningLayer';

export interface VideoCardOverlayLayersProps {
  /** When false, skip scrubber + social overlay (list rows far from the active page). Content warning still mounts. */
  renderHeavyChrome?: boolean;
  shouldRenderScrubber: boolean;
  scrubberActive: boolean;
  /** Controls whether the overlay layer receives touch events. Pass false for off-screen cards. */
  isActive: boolean;
  player: VideoPlayer | null;
  seekingAnimationSV: SharedValue<number>;
  overlayOpacitySV: SharedValue<number>;
  showOverlay: boolean;
  overlayProps: VideoOverlayUIProps;
  showContentWarning: boolean;
  cannotShowMedia: boolean;
  isBlurred: boolean;
  warningDescription: string;
  onViewContent: () => void;
}

function VideoCardOverlayLayers({
  renderHeavyChrome = true,
  shouldRenderScrubber,
  scrubberActive,
  isActive,
  player,
  seekingAnimationSV,
  overlayOpacitySV,
  showOverlay,
  overlayProps,
  showContentWarning,
  cannotShowMedia,
  isBlurred,
  warningDescription,
  onViewContent,
}: VideoCardOverlayLayersProps) {
  return (
    <>
      {renderHeavyChrome && shouldRenderScrubber ? (
        <View style={styles.videoScrubberLayer} pointerEvents="box-none">
          <VideoScrubber
            active={scrubberActive}
            player={player ?? undefined}
            seekingAnimationSV={seekingAnimationSV}
            overlayOpacitySV={overlayOpacitySV}
          />
        </View>
      ) : null}

      {renderHeavyChrome && showOverlay ? (
        <View style={styles.videoOverlayLayer} pointerEvents={isActive ? 'box-none' : 'none'}>
          <VideoOverlayUI {...overlayProps} />
        </View>
      ) : null}

      {showContentWarning ? (
        <VideoCardContentWarningLayer
          cannotShowMedia={cannotShowMedia}
          isBlurred={isBlurred}
          warningDescription={warningDescription}
          onViewContent={onViewContent}
        />
      ) : null}
    </>
  );
}

const areOverlayPropsEqual = (prev: VideoOverlayUIProps, next: VideoOverlayUIProps): boolean => {
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

  return true;
};

const arePropsEqual = (
  prev: VideoCardOverlayLayersProps,
  next: VideoCardOverlayLayersProps
): boolean => {
  if (prev.renderHeavyChrome !== next.renderHeavyChrome) return false;
  if (prev.showOverlay !== next.showOverlay) return false;
  if (prev.shouldRenderScrubber !== next.shouldRenderScrubber) return false;
  if (prev.scrubberActive !== next.scrubberActive) return false;
  if (prev.isActive !== next.isActive) return false;
  if (prev.showContentWarning !== next.showContentWarning) return false;
  if (prev.cannotShowMedia !== next.cannotShowMedia) return false;
  if (prev.isBlurred !== next.isBlurred) return false;
  if (prev.warningDescription !== next.warningDescription) return false;
  if (prev.onViewContent !== next.onViewContent) return false;

  // Skip heavy comparisons entirely for rows where heavy chrome is not mounted.
  if (!next.renderHeavyChrome) {
    return true;
  }

  if (next.shouldRenderScrubber) {
    if (prev.player !== next.player) return false;
    if (prev.seekingAnimationSV !== next.seekingAnimationSV) return false;
    if (prev.overlayOpacitySV !== next.overlayOpacitySV) return false;
  }

  if (next.showOverlay && !areOverlayPropsEqual(prev.overlayProps, next.overlayProps)) {
    return false;
  }

  return true;
};

const styles = StyleSheet.create({
  videoScrubberLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  videoOverlayLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 14,
  },
});

export default memo(VideoCardOverlayLayers, arePropsEqual);
