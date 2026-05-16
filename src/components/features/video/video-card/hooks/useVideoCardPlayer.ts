import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useEvent } from 'expo';
import { useVideoPlayer, type VideoPlayer, type VideoSource } from 'expo-video';
import { useRecyclingState } from '@shopify/flash-list';
import { useStableRef } from '@/hooks/useStableRef';

import {
  createVideoSource,
  FEED_BUFFER_OPTIONS,
  DEFAULT_SEEK_TOLERANCE_SCRUBBER,
} from '../../../../../utils/video/helpers';
import { logger } from '../../../../../utils/logger';

export function logVideoCardPlayerError(action: string, err: unknown): void {
  logger.debug(`VideoCard: ${action} threw`, {
    component: 'VideoCard',
    action,
    error: err instanceof Error ? err.message : String(err),
  });
}

const computeShouldPlayVideo = ({
  cannotShowMedia,
  isBlurred,
  canPlay,
  hasError,
  userPaused,
  isVisible,
  videoUrl,
}: {
  cannotShowMedia: boolean;
  isBlurred: boolean;
  canPlay: boolean;
  hasError: boolean;
  userPaused: boolean;
  isVisible: boolean;
  videoUrl: string | null;
}): boolean =>
  !cannotShowMedia &&
  !isBlurred &&
  canPlay &&
  !hasError &&
  !userPaused &&
  isVisible &&
  Boolean(videoUrl);

export interface UseVideoCardPlayerArgs {
  videoUrl: string | null;
  postUri: string;
  feedOption?: string;
  isVisible: boolean;
  holdSource: boolean;
  canPlay: boolean;
  cannotShowMedia: boolean;
  isBlurred: boolean;
  onVideoStatus?: (uri: string, status: string) => void;
}

export interface UseVideoCardPlayerResult {
  videoSource: VideoSource | null;
  player: VideoPlayer;
  hasError: boolean;
  shouldPlayVideo: boolean;
  shouldLoadVideo: boolean;
  userPaused: boolean;
  togglePlayback: (shouldPlay?: boolean) => void;
  seek: (position: number) => void;
  firstFrameRendered: boolean;
  handleFirstFrameRender: () => void;
  userPausedRef: React.RefObject<boolean>;
  setUserPaused: (next: boolean) => void;
}

export function useVideoCardPlayer({
  videoUrl,
  postUri,
  feedOption,
  isVisible,
  holdSource,
  canPlay,
  cannotShowMedia,
  isBlurred,
  onVideoStatus,
}: UseVideoCardPlayerArgs): UseVideoCardPlayerResult {
  const videoSource = useMemo(() => createVideoSource(videoUrl), [videoUrl]);

  const configureVideoPlayer = useCallback((player: VideoPlayer) => {
    player.loop = true;
    player.bufferOptions = FEED_BUFFER_OPTIONS;
    player.seekTolerance = DEFAULT_SEEK_TOLERANCE_SCRUBBER;
  }, []);

  const player = useVideoPlayer(null, configureVideoPlayer);
  const playerRef = useStableRef(player);

  const playerStatusEvent = useEvent(player, 'statusChange', { status: 'idle' });
  const playerStatus = playerStatusEvent?.status ?? 'idle';
  const hasError = playerStatus === 'error';

  const lastReplacedSourceRef = useRef<VideoSource | null>(null);
  const hasRetriedErrorRef = useRef(false);

  useEffect(() => {
    if (!hasError) {
      hasRetriedErrorRef.current = false;
    }
  }, [hasError]);

  useEffect(() => {
    const abortController = new AbortController();
    const shouldLoad = holdSource || (hasError && isVisible);
    const source = shouldLoad && videoSource ? videoSource : null;

    const sourceChanged = source !== lastReplacedSourceRef.current;
    const shouldRetryError = hasError && !hasRetriedErrorRef.current;

    if (!sourceChanged && !shouldRetryError) {
      return;
    }

    lastReplacedSourceRef.current = source;
    if (hasError) {
      hasRetriedErrorRef.current = true;
    }

    playerRef.current.replaceAsync(source).catch(err => {
      if (!abortController.signal.aborted) logVideoCardPlayerError('replaceAsync', err);
    });
    return () => {
      abortController.abort();
    };
  }, [holdSource, videoSource, hasError, isVisible]);

  const [videoState, setVideoState] = useRecyclingState({ userPaused: false }, [
    postUri,
    feedOption,
  ]);

  const userPausedRef = useStableRef(videoState.userPaused);

  const setUserPaused = useCallback(
    (next: boolean) => {
      setVideoState(prev => (prev.userPaused === next ? prev : { ...prev, userPaused: next }));
    },
    [setVideoState]
  );

  const togglePlayback = useCallback(
    (shouldPlay?: boolean) => {
      if (cannotShowMedia || isBlurred || !canPlay) return;
      if (hasError) return;
      setVideoState(prev => {
        const nextPaused = shouldPlay !== undefined ? !shouldPlay : !prev.userPaused;
        if (prev.userPaused === nextPaused) return prev;
        return { ...prev, userPaused: nextPaused };
      });
    },
    [cannotShowMedia, isBlurred, canPlay, hasError, setVideoState]
  );

  const seek = useCallback(
    (position: number) => {
      try {
        const positionInSeconds = position > 1000 ? position / 1000 : position;
        // eslint-disable-next-line react-compiler/react-compiler
        playerRef.current.currentTime = positionInSeconds;
      } catch (err) {
        logVideoCardPlayerError('seek', err);
      }
    },
    []
  );

  const [firstFrameRendered, setFirstFrameRendered] = useRecyclingState(false, [
    postUri,
    feedOption,
  ]);

  const handleFirstFrameRender = useCallback(() => {
    setFirstFrameRendered(true);
  }, [setFirstFrameRendered]);

  const wasActiveRef = useRef(false);
  useEffect(() => {
    const becameActive = isVisible && !wasActiveRef.current;
    if (becameActive && videoState.userPaused && !hasError) {
      setUserPaused(false);
    }
    wasActiveRef.current = isVisible;
  }, [isVisible, hasError, videoState.userPaused, setUserPaused]);

  useEffect(() => {
    if (playerStatus === 'readyToPlay') onVideoStatus?.(postUri, 'loaded');
    else if (playerStatus === 'loading') onVideoStatus?.(postUri, 'loading');
    else if (playerStatus === 'error') onVideoStatus?.(postUri, 'error');
  }, [playerStatus, postUri, onVideoStatus]);

  const shouldPlayVideo = computeShouldPlayVideo({
    cannotShowMedia,
    isBlurred,
    canPlay,
    hasError,
    userPaused: videoState.userPaused,
    isVisible,
    videoUrl,
  });

  useEffect(() => {
    try {
      if (shouldPlayVideo) playerRef.current.play();
      else playerRef.current.pause();
    } catch (err) {
      logVideoCardPlayerError(shouldPlayVideo ? 'play' : 'pause', err);
    }
  }, [shouldPlayVideo]);

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
    firstFrameRendered,
    handleFirstFrameRender,
    userPausedRef,
    setUserPaused,
  };
}
