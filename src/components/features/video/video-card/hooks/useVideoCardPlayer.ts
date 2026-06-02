import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useEvent } from 'expo';
import { useVideoPlayer, type VideoPlayer, type VideoSource } from 'expo-video';
import { useRecyclingState } from '@shopify/flash-list';
import { useSharedValue, useAnimatedReaction } from 'react-native-reanimated';

import {
  createVideoSource,
  FEED_BUFFER_OPTIONS,
  DEFAULT_SEEK_TOLERANCE_SCRUBBER,
} from '../../../../../utils/video/helpers';
import { logger } from '../../../../../utils/logger';
import { computeShouldPlayVideo } from './computeShouldPlayVideo';

function logVideoCardPlayerError(action: string, err: unknown): void {
  logger.debug(`VideoCard: ${action} threw`, {
    component: 'VideoCard',
    action,
    error: err instanceof Error ? err.message : String(err),
  });
}

export interface UseVideoCardPlayerArgs {
  videoUrl: string | null;
  postUri: string;
  feedOption?: string;
  isVisible: boolean;
  /**
   * When true, hold an HLS source on this row's `useVideoPlayer` so the
   * player buffers ahead of swipe. Computed by the list-level playback store
   * (`ROW_BITS_PRELOAD`) — keeps source juggling out of this hook so the
   * preload window can be tuned in one place.
   */
  holdSource: boolean;
  shouldDisablePlayback: boolean;
  cannotShowMedia: boolean;
  isBlurred: boolean;
  onVideoStatus?: (uri: string, status: string) => void;
}

export interface UseVideoCardPlayerResult {
  videoSource: VideoSource | null;
  player: VideoPlayer | null;
  hasError: boolean;
  shouldPlayVideo: boolean;
  shouldLoadVideo: boolean;
  userPaused: boolean;
  togglePlayback: (shouldPlay?: boolean) => void;
  seek: (position: number) => void;
  /** UI-thread shared value: 1 = first frame rendered, 0 = poster visible. */
  firstFrameSV: ReturnType<typeof useSharedValue<number>>;
  handleFirstFrameRender: () => void;
  /** Live ref for handlers that need to read the latest user-paused flag without re-running. */
  userPausedRef: React.RefObject<boolean>;
  /** Live ref for the player's reported play state. */
  setUserPaused: (next: boolean) => void;
}

/**
 * Owns the per-card video player lifecycle: source juggling for the visible/preload window,
 * player creation, status events, error retry, play/pause sync, and the poster-vs-first-frame
 * gate. Carved out of VideoCard.tsx so the parent can stay small and so the player code can
 * be tested / iterated on independently.
 *
 * `activeSource` is held only while `holdSource` is true (set by the list-level playback
 * store's `ROW_BITS_PRELOAD` — currently active row + 1 behind + 2 ahead). Far rows get
 * `null` so AVPlayer doesn't open concurrent HLS manifests on Android (NSURLErrorDomain
 * -1008/-12884).
 */
export function useVideoCardPlayer({
  videoUrl,
  postUri,
  feedOption,
  isVisible,
  holdSource,
  shouldDisablePlayback,
  cannotShowMedia,
  isBlurred,
  onVideoStatus,
}: UseVideoCardPlayerArgs): UseVideoCardPlayerResult {
  const videoSource = useMemo(() => createVideoSource(videoUrl), [videoUrl]);
  const activeSource = holdSource ? videoSource : null;

  const configureVideoPlayer = useCallback((player: VideoPlayer) => {
    player.loop = true;
    player.bufferOptions = FEED_BUFFER_OPTIONS;
    player.seekTolerance = DEFAULT_SEEK_TOLERANCE_SCRUBBER;
  }, []);

  const player = useVideoPlayer(activeSource, configureVideoPlayer);

  const playerStatusEvent = useEvent(player, 'statusChange', { status: 'idle' });
  const playerStatus = playerStatusEvent?.status ?? 'idle';
  const hasError = playerStatus === 'error';

  const [videoState, setVideoState] = useRecyclingState({ userPaused: false }, [
    postUri,
    feedOption,
  ]);

  const userPausedRef = useRef(videoState.userPaused);

  useLayoutEffect(() => {
    userPausedRef.current = videoState.userPaused;
  }, [videoState.userPaused]);

  const setUserPaused = useCallback(
    (next: boolean) => {
      setVideoState(prev => (prev.userPaused === next ? prev : { ...prev, userPaused: next }));
    },
    [setVideoState]
  );

  const togglePlayback = useCallback(
    (shouldPlay?: boolean) => {
      if (cannotShowMedia || isBlurred || shouldDisablePlayback) return;
      if (hasError) return;
      setVideoState(prev => {
        const nextPaused = shouldPlay !== undefined ? !shouldPlay : !prev.userPaused;
        if (prev.userPaused === nextPaused) return prev;
        return { ...prev, userPaused: nextPaused };
      });
    },
    [cannotShowMedia, isBlurred, shouldDisablePlayback, hasError, setVideoState]
  );

  const seek = useCallback(
    (position: number) => {
      if (!player) return;
      try {
        const positionInSeconds = position > 1000 ? position / 1000 : position;
        // expo-video player is an imperative SDK handle; assigning currentTime is the
        // documented seek API. Not a React-managed value.
        // eslint-disable-next-line react-compiler/react-compiler
        player.currentTime = positionInSeconds;
      } catch (err) {
        logVideoCardPlayerError('seek', err);
      }
    },
    [player]
  );

  // UI-thread shared value: 1 = first frame has rendered into the VideoView, 0 = show poster.
  // Reset to 0 when the card leaves the viewport so the poster is shown again on return.
  const firstFrameSV = useSharedValue(0);

  const handleFirstFrameRender = useCallback(() => {
    firstFrameSV.value = 1;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset when visibility goes false — runs on UI thread, no JS setState.
  useAnimatedReaction(
    () => isVisible,
    (visible, prev) => {
      if (!visible && prev) firstFrameSV.value = 0;
    },
    [isVisible]
  );

  useEffect(() => {
    if (!player) return;
    if (playerStatus === 'readyToPlay') onVideoStatus?.(postUri, 'loaded');
    else if (playerStatus === 'loading') onVideoStatus?.(postUri, 'loading');
    else if (playerStatus === 'error') onVideoStatus?.(postUri, 'error');
  }, [playerStatus, player, postUri, onVideoStatus]);

  // Visibility cycling re-runs this effect, so each foreground return gets one retry attempt.
  useEffect(() => {
    if (!hasError || !isVisible || !videoSource || !player) return;
    player.replaceAsync(videoSource).catch(err => {
      logVideoCardPlayerError('replaceAsync retry', err);
    });
  }, [hasError, isVisible, videoSource, player]);

  const shouldPlayVideo = computeShouldPlayVideo({
    cannotShowMedia,
    isBlurred,
    shouldDisablePlayback,
    hasError,
    userPaused: videoState.userPaused,
    isVisible,
    videoUrl,
  });

  useEffect(() => {
    if (!player) return;
    try {
      if (shouldPlayVideo) player.play();
      else player.pause();
    } catch (err) {
      logVideoCardPlayerError(shouldPlayVideo ? 'play' : 'pause', err);
    }
  }, [shouldPlayVideo, player]);

  const shouldLoadVideo = !cannotShowMedia && !isBlurred && !!videoSource;

  return {
    videoSource,
    player,
    hasError,
    shouldPlayVideo,
    shouldLoadVideo,
    userPaused: videoState.userPaused,
    togglePlayback,
    seek,
    firstFrameSV,
    handleFirstFrameRender,
    userPausedRef,
    setUserPaused,
  };
}
