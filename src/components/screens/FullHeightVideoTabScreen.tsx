import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { skipToken, useQuery } from '@tanstack/react-query';
import { AtUri } from '@atproto/syntax';

import { NativePressable } from '@/components/ui/NativePressable';
import { BackArrowIcon } from '@/components/ui/Icon';
import { Colors } from '@/theme';
import { FollowProvider } from '@/context/FollowContext';
import { VideoItem } from '@/components/features/feed/VideoItem';
import { IOS_LIQUID_GLASS_EXTRA_BOTTOM_PADDING } from '@/components/features/feed/feedViewShared';
import { feedService } from '@/services/FeedService';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import { isIosLiquidGlassAvailable } from '@/stores/userStore';
import { getVideoCardHeight } from '@/utils/video/helpers';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { useFeedVisibility } from '@/core/visibility/hooks';
import { useVisibilityRouteIsActive } from '@/hooks';
import { AtprotoFeedService } from '@/services/api/feed/FeedService';
import { useProfile } from '@/services/data/ProfileService';
import { useCurrentUser } from '@/stores/userStore';
import { isValidDid } from '@/utils/atproto/uriValidation';
import { fullHeightVideoFeedItem } from '@/utils/feed/seedFullHeightVideoFeed';
import { queryKeys } from '@/utils/query/queryKeys';
import { isRetryableError } from '@/utils/query/retryPolicy';
import { getLinkedVideoState, type FeedEmptyState } from '@/utils/feed/feedEmptyState';
import EmptyFeed from '@/components/features/feed/EmptyFeed';

const ROUTE_KEY = 'full-height-video-modal';
const FEED_OPTION = 'full-height-video';

type FeedItem = NonNullable<ReturnType<typeof feedService.getCurrentFeed>[number]>;

type PlaybackProps = {
  insets: EdgeInsets;
  feedItem: FeedItem;
  canPlay: boolean;
};

function parsePostUri(postUri: string | null): AtUri | null {
  if (!postUri) return null;
  try {
    return new AtUri(postUri);
  } catch {
    return null;
  }
}

interface LinkedPost {
  feedItem?: FeedItem;
  /** What shows while there is no post to play (`getLinkedVideoState`). */
  state: FeedEmptyState;
  retry: () => void;
}

/**
 * A post opened from a getorbyt.com link (`+native-intent`), which nothing seeded into
 * `feedService`. The link names the author by handle or DID; resolve a handle first, since
 * `getPosts` answers with DID URIs.
 */
function useLinkedPost(postUri: string | null): LinkedPost {
  const { currentUser } = useCurrentUser();
  const linked = parsePostUri(postUri);
  const author = linked?.host ?? null;
  const authorIsDid = isValidDid(author);
  const authorQuery = useProfile(author && !authorIsDid ? author : null);
  const authorDid = authorIsDid ? author : (authorQuery.data?.did ?? null);
  const resolvedUri =
    linked && authorDid ? `at://${authorDid}/${linked.collection}/${linked.rkey}` : null;

  const postQuery = useQuery({
    queryKey: queryKeys.posts.detail(resolvedUri ?? ''),
    queryFn: resolvedUri ? () => AtprotoFeedService.getVideoPost(resolvedUri) : skipToken,
  });

  const post = postQuery.data;
  const error = authorQuery.error ?? postQuery.error;
  const { refetch: refetchAuthor } = authorQuery;
  const { refetch: refetchPost } = postQuery;
  const authorFailed = authorQuery.isError;
  const retry = useCallback(() => {
    if (authorFailed) void refetchAuthor();
    else void refetchPost();
  }, [authorFailed, refetchAuthor, refetchPost]);

  return {
    feedItem:
      post && resolvedUri
        ? (fullHeightVideoFeedItem(post, resolvedUri, currentUser?.did ?? undefined) ?? undefined)
        : undefined,
    state: getLinkedVideoState({
      isLoading: authorQuery.isLoading || postQuery.isLoading,
      isError: !!error,
      isErrorRetryable: isRetryableError(error),
      isPaused: authorQuery.isPaused || postQuery.isPaused,
    }),
    retry,
  };
}

/**
 * Stack screen inside a tab: parent flex area already sits above the native tab bar — same inset
 * behavior as other tab stacks (no root transparent modal).
 */
const FullHeightVideoPlayback = memo(function FullHeightVideoPlayback({
  insets,
  feedItem,
  canPlay,
}: PlaybackProps) {
  const { screenWidth, screenHeight } = useDeviceLayout();
  const hasTabBar = true;
  const useManualIosGlassTabPaddingLayout = hasTabBar && isIosLiquidGlassAvailable;

  const viewableAreaHeight = (() => {
    if (!hasTabBar) {
      const maxViewport = Math.max(0, screenHeight - insets.bottom);
      return maxViewport;
    }
    if (useManualIosGlassTabPaddingLayout) {
      return screenHeight;
    }
    // For non-liquid glass, don't subtract status bar - only subtract bottom inset
    return Math.max(0, screenHeight - insets.bottom);
  })();

  const cardHeight = useManualIosGlassTabPaddingLayout
    ? getVideoCardHeight(screenWidth, screenHeight)
    : viewableAreaHeight;

  const topInset = typeof insets.top === 'number' ? insets.top : 0;
  const bottomInset = typeof insets.bottom === 'number' ? insets.bottom : 0;

  const cardWidth = (() => {
    if (!useManualIosGlassTabPaddingLayout) return screenWidth;
    return (cardHeight * 9) / 16;
  })();

  const safeAreaVideoAreaStyle = {
    paddingTop: topInset,
    paddingBottom:
      bottomInset + (useManualIosGlassTabPaddingLayout ? IOS_LIQUID_GLASS_EXTRA_BOTTOM_PADDING : 0),
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  };

  const cardContainerStyle = {
    width: cardWidth,
    height: cardHeight,
    overflow: 'hidden' as const,
  };

  return (
    <View style={styles.videoArea}>
      {useManualIosGlassTabPaddingLayout ? (
        <View style={[safeAreaVideoAreaStyle, styles.videoAreaLiquidGlassInner]}>
          <View style={cardContainerStyle}>
            <VideoItem
              feedItem={feedItem}
              post={feedItem.post}
              height={cardHeight}
              feedOption={FEED_OPTION}
              canPlay={canPlay}
              index={0}
              isAppleZoomTarget={Platform.OS === 'ios'}
            />
          </View>
        </View>
      ) : (
        <VideoItem
          feedItem={feedItem}
          post={feedItem.post}
          height={cardHeight}
          feedOption={FEED_OPTION}
          canPlay={canPlay}
          index={0}
          isAppleZoomTarget={Platform.OS === 'ios'}
        />
      )}
    </View>
  );
});

const FullHeightVideoTabScreen = memo(() => {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ postUri?: string }>();
  const postUri = typeof params.postUri === 'string' ? params.postUri : '';

  const isRouteFocused = useVisibilityRouteIsActive(ROUTE_KEY);

  const { canPlay } = useFeedVisibility({
    isActive: isRouteFocused,
  });

  const items = feedService.getCurrentFeed();
  const seededItem = postUri && items[0]?.post?.uri === postUri ? items[0] : undefined;
  const linkedPost = useLinkedPost(seededItem ? null : postUri || null);
  const feedItem = seededItem ?? linkedPost.feedItem;

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const backButtonTop = (typeof insets.top === 'number' ? insets.top : 0) + 15;

  const backButtonDynamicStyle = {
    top: backButtonTop,
  };

  return (
    <FollowProvider>
      <View style={styles.container}>
        <NativePressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={handleClose}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={[styles.backButton, backButtonDynamicStyle]}
        >
          <BackArrowIcon size={30} color={Colors.neutral[50]} />
        </NativePressable>

        {feedItem ? (
          <FullHeightVideoPlayback
            key={postUri}
            insets={insets}
            feedItem={feedItem}
            canPlay={canPlay}
          />
        ) : (
          <View style={styles.placeholder}>
            {linkedPost.state === 'loading' ? (
              <ActivityIndicator style={styles.spinner} size="large" color={Colors.neutral[50]} />
            ) : (
              <EmptyFeed
                type={linkedPost.state}
                message={
                  linkedPost.state === 'unavailable' ? t('video.linkedVideoUnavailable') : undefined
                }
                onRetry={linkedPost.retry}
              />
            )}
          </View>
        )}
      </View>
    </FollowProvider>
  );
});

FullHeightVideoTabScreen.displayName = 'FullHeightVideoTabScreen';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  videoArea: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  videoAreaLiquidGlassInner: {
    flex: 1,
  },
  placeholder: {
    flex: 1,
  },
  spinner: {
    flex: 1,
  },
  backButton: {
    position: 'absolute',
    left: 20,
    zIndex: 20,
  },
});

export default FullHeightVideoTabScreen;
