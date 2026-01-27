/**
 * Lightweight placeholder for off-screen video cards.
 * Poster + BlurredBackground only. Content-warning lives in VideoCard when near.
 * Used when isNearViewable is false to defer useVideoPlayer/ExpoVideoView.
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { Colors } from '../../ui/UI';
import BlurredBackground from '../../ui/BlurredBackground';
import { getVideoView } from '../../../utils/video/helpers';
import type { ExtendedPostView, ExtendedFeedViewPost, PostView } from '../../../services/api/types';

type Post = ExtendedPostView | ExtendedFeedViewPost;

export interface VideoCardPlaceholderProps {
  post: Post;
  height?: number;
}

const VideoCardPlaceholder: React.FC<VideoCardPlaceholderProps> = ({
  post,
  height: heightProp,
}) => {
  const { width } = Dimensions.get('window');
  const videoView = useMemo(() => {
    const embed =
      (post as { embed?: unknown }).embed ?? (post as { post?: { embed?: unknown } }).post?.embed;
    return getVideoView(embed as PostView['embed'] | null | undefined);
  }, [post]);
  const posterUrl = videoView?.thumbnail || null;
  const aspectRatio = videoView?.aspectRatio
    ? videoView.aspectRatio.width / videoView.aspectRatio.height
    : 16 / 9;
  const cardHeight = heightProp || width * aspectRatio;

  return (
    <View style={[styles.container, { height: cardHeight }]}>
      <BlurredBackground thumbnailUrl={posterUrl} />
      {!!posterUrl && (
        <Image source={{ uri: posterUrl }} contentFit="contain" style={styles.poster} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: Colors.black,
  },
  poster: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
});

export default React.memo(VideoCardPlaceholder);
