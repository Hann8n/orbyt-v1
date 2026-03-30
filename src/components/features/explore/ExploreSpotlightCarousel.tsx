import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, FlatList, Platform, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Link, useRouter, type Href } from 'expo-router';

import { NativePressable } from '@/components/ui/NativePressable';
import { Icon } from '@/components/ui/UI';
import { Colors } from '@/theme';
import { SCROLL_INDICATOR_CONSTANTS } from '@/utils/constants';
import type { ExtendedFeedViewPost } from '@/services/api/types';
import { getVideoView } from '@/utils/video/helpers';
import BlurredBackground from '@/components/ui/BlurredBackground';
import { feedService } from '@/services/FeedService';
import {
  buildFeedModalHref,
  type GridFeedModalZoomConfig,
} from '@/utils/navigation/feedModalRoute';

import { exploreScreenStyles as styles } from './ExploreScreenStyles';

const SPOTLIGHT_THUMB_HEIGHT = 160;

function formatSpotlightFeed(videos: ExtendedFeedViewPost[]): ExtendedFeedViewPost[] {
  return videos.map((vItem: ExtendedFeedViewPost) => ({
    ...vItem,
    post: vItem.post || vItem,
    uniqueKey: vItem.post?.uri || vItem.uniqueKey,
  }));
}

type ZoomLink = { href: Href; onBeforeNavigate: () => void };

type SpotlightVideoCellProps = {
  video: ExtendedFeedViewPost;
  zoomLink?: ZoomLink;
  onFallbackPress: () => void;
};

const SpotlightVideoCell = React.memo(
  ({ video, zoomLink, onFallbackPress }: SpotlightVideoCellProps) => {
    const { t } = useTranslation();
    const v = video;
    const videoData = v.post || video;
    const videoView = getVideoView(videoData?.embed);
    const thumbnailUrl = videoView?.thumbnail || null;
    const shouldBlur = !!(v.contentListUI?.blur || v.contentMediaUI?.blur);

    const cellInner = (
      <View style={styles.spotlightVideoThumbnailContainer}>
        <BlurredBackground thumbnailUrl={thumbnailUrl} />
        {thumbnailUrl ? (
          <Image
            source={{ uri: thumbnailUrl }}
            style={styles.spotlightVideoThumbnail}
            contentFit="contain"
            cachePolicy="memory-disk"
            priority="normal"
            transition={200}
          />
        ) : (
          <View style={styles.spotlightVideoThumbnailPlaceholder}>
            <Icon name="video_camera_2" size={16} color={Colors.neutral[500]} />
          </View>
        )}
        {shouldBlur && (
          <View style={styles.spotlightWarningOverlay}>
            <Text style={styles.spotlightWarningText}>{t('feed.contentWarning')}</Text>
          </View>
        )}
      </View>
    );

    const flattenedOuterStyle = StyleSheet.flatten([
      styles.spotlightVideoItem,
      { height: SPOTLIGHT_THUMB_HEIGHT },
    ]);

    if (zoomLink) {
      return (
        <Link href={zoomLink.href} asChild>
          <Pressable style={flattenedOuterStyle} onPress={zoomLink.onBeforeNavigate}>
            <Link.AppleZoom>
              <View collapsable={false} style={styles.spotlightAppleZoomSourceInner}>
                {cellInner}
              </View>
            </Link.AppleZoom>
          </Pressable>
        </Link>
      );
    }

    return (
      <NativePressable
        style={[styles.spotlightVideoItem, { height: SPOTLIGHT_THUMB_HEIGHT }]}
        onPress={onFallbackPress}
      >
        {cellInner}
      </NativePressable>
    );
  }
);
SpotlightVideoCell.displayName = 'SpotlightVideoCell';

type Props = {
  videos: ExtendedFeedViewPost[];
};

export const ExploreSpotlightCarousel = React.memo(({ videos }: Props) => {
  const router = useRouter();

  const formattedFeed = useMemo(() => formatSpotlightFeed(videos), [videos]);

  const spotlightZoomConfig = useMemo((): GridFeedModalZoomConfig | null => {
    if (Platform.OS !== 'ios' || formattedFeed.length === 0) {
      return null;
    }
    return {
      onBeforeNavigate: (index: number) => {
        if (index >= 0 && index < formattedFeed.length) {
          feedService.setCurrentFeed(formattedFeed);
        }
      },
      buildHref: (index: number) => {
        const item = formattedFeed[index];
        const postUri = item?.post?.uri ?? '';
        return buildFeedModalHref(
          {
            initialIndex: String(index),
            initialPostUri: postUri,
            feedOption: 'search',
            backgroundColor: 'transparent',
            secondaryColor: Colors.neutral[50],
            hasNextPage: 'false',
            isFetchingNextPage: 'false',
          },
          'explore'
        );
      },
    };
  }, [formattedFeed]);

  const openSpotlightAtIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= formattedFeed.length) return;
      feedService.setCurrentFeed(formattedFeed);
      const videoUri = formattedFeed[index]?.post?.uri ?? '';
      router.navigate(
        buildFeedModalHref(
          {
            initialIndex: String(index),
            initialPostUri: videoUri,
            feedOption: 'search',
            backgroundColor: 'transparent',
            secondaryColor: Colors.neutral[50],
            hasNextPage: 'false',
            isFetchingNextPage: 'false',
          },
          'explore'
        )
      );
    },
    [formattedFeed, router]
  );

  const keyExtractor = useCallback((video: ExtendedFeedViewPost, index: number) => {
    const videoUri = video.post?.uri || (video as { uri?: string }).uri;
    return `spotlight-video-${videoUri || index}`;
  }, []);

  const renderItem = useCallback(
    ({ item: video, index }: { item: ExtendedFeedViewPost; index: number }) => {
      const zoomLink: ZoomLink | undefined =
        spotlightZoomConfig && Platform.OS === 'ios'
          ? {
              href: spotlightZoomConfig.buildHref(index),
              onBeforeNavigate: () => spotlightZoomConfig.onBeforeNavigate(index),
            }
          : undefined;

      return (
        <SpotlightVideoCell
          video={video}
          zoomLink={zoomLink}
          onFallbackPress={() => openSpotlightAtIndex(index)}
        />
      );
    },
    [spotlightZoomConfig, openSpotlightAtIndex]
  );

  return (
    <View style={styles.spotlightContainer}>
      <FlatList
        data={videos}
        horizontal
        showsHorizontalScrollIndicator={
          videos.length >= SCROLL_INDICATOR_CONSTANTS.SPOTLIGHT_CAROUSEL_MIN_ITEMS
        }
        contentContainerStyle={styles.spotlightScrollContainer}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
      />
    </View>
  );
});
ExploreSpotlightCarousel.displayName = 'ExploreSpotlightCarousel';
