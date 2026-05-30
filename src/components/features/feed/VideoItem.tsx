import { useMemo, memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Link } from 'expo-router';

import VideoCard from '../video/VideoCard';
import type { ExtendedPostView, ExtendedFeedViewPost, PostView } from '../../../services/api/types';
import { getVideoView } from '../../../utils/video/helpers';
import { Colors } from '../../../theme';

export interface VideoItemProps {
  post: ExtendedPostView | ExtendedFeedViewPost;
  feedItem?: ExtendedFeedViewPost; // Preferred - contains feedContext and reqId natively
  height: number;
  feedOption?: string;
  index?: number;
  isAppleZoomTarget?: boolean;
  onHashtagPress?: (hashtag: string) => void;
  /** Whether this specific card is the active (focused) card in the list. */
  isActive?: boolean;
  canPlay?: boolean;
}

function VideoItemComponent({
  post,
  feedItem,
  height,
  feedOption,
  canPlay,
  index = 0,
  isAppleZoomTarget = false,
  onHashtagPress,
  isActive = false,
}: VideoItemProps) {
  const embed = 'embed' in post ? (post.embed as PostView['embed']) : undefined;
  const videoView = getVideoView(embed);
  const hasVideo = Boolean(videoView?.playlist);

  const rowStyle = useMemo(() => [styles.videoContainer, { height }], [height]);

  if (!hasVideo) {
    return <View style={rowStyle} pointerEvents="none" collapsable={false} />;
  }

  const videoCard = (
    <VideoCard
      post={post}
      feedItem={feedItem}
      feedOption={feedOption}
      height={height}
      canPlay={canPlay}
      index={index}
      isActive={isActive}
      onHashtagPress={onHashtagPress}
    />
  );

  return (
    <View style={rowStyle}>
      {isAppleZoomTarget ? (
        <Link.AppleZoomTarget>
          <View style={styles.appleZoomTargetInner}>{videoCard}</View>
        </Link.AppleZoomTarget>
      ) : (
        videoCard
      )}
    </View>
  );
}

export const VideoItem = memo(VideoItemComponent);
VideoItemComponent.displayName = 'VideoItem';

const styles = StyleSheet.create({
  videoContainer: {
    width: '100%',
    position: 'relative',
    backgroundColor: Colors.black,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appleZoomTargetInner: {
    flex: 1,
    width: '100%',
    minHeight: 0,
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
});
