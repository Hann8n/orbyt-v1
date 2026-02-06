/**
 * Lightweight placeholder for off-screen video cards.
 * Poster + BlurredBackground only. Content-warning lives in VideoCard when near.
 * Used when isNearViewable is false to defer useVideoPlayer/ExpoVideoView.
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { Colors } from '../../../theme';
import BlurredBackground from '../../ui/BlurredBackground';
import { getVideoMetadata, getVideoAspectRatioFromEmbed } from '../../../utils/video/helpers';
import type { ExtendedPostView, ExtendedFeedViewPost, PostView } from '../../../services/api/types';

type Post = ExtendedPostView | ExtendedFeedViewPost;

function getEmbed(post: Post): PostView['embed'] | null | undefined {
  return (
    (post as { embed?: PostView['embed'] }).embed ??
    (post as { post?: { embed?: PostView['embed'] } }).post?.embed
  );
}

export interface VideoCardPlaceholderProps {
  post: Post;
  height?: number;
}

const VideoCardPlaceholder: React.FC<VideoCardPlaceholderProps> = ({
  post,
  height: heightProp,
}) => {
  const { width } = Dimensions.get('window');
  const embed = useMemo(() => getEmbed(post), [post]);
  const meta = useMemo(() => getVideoMetadata(embed), [embed]);
  const posterUrl = meta?.thumbnail ?? null;
  const aspectRatio = getVideoAspectRatioFromEmbed(embed);
  const cardHeight = heightProp ?? width / aspectRatio;

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
