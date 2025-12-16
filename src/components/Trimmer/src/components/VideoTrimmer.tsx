import React, { forwardRef, useState, useEffect, type Ref } from 'react';
import { View, type ViewStyle } from 'react-native';
import { useSharedValue, useAnimatedReaction } from 'react-native-reanimated';
import Video, {
  type ReactVideoSource,
  type VideoRef,
  type OnLoadData,
  type OnProgressData,
} from 'react-native-video';
import Slider from './Slider';
import { videoTrimmerStyles } from './styles';
import { extractFrames, type FrameInfo } from '../utils/frameExtractor';

export interface VideoTrimmerProps {
  containerStyle?: ViewStyle;
  source: ReactVideoSource;
  loop?: boolean;
  sliderContainerStyle?: ViewStyle;
  tintColor?: string;
  onSelected?: (start: number, end: number) => void;
  minDuration?: number;
  maxDuration?: number;
}

export interface VideoTrimmerRef {
  getSelection: () => [number, number];
}

const MIN_DURATION = 1;

function VideoTrimmerUI(props: VideoTrimmerProps, ref: Ref<unknown>) {
  const {
    containerStyle,
    source,
    loop = true,
    sliderContainerStyle,
    tintColor = '#24a0ed',
    onSelected,
    minDuration = MIN_DURATION,
    maxDuration,
  } = props;
  const [playbackTime, setPlaybackTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [thumbs, setThumbs] = useState<[number, number]>([0, 0]);
  const [frames, setFrames] = useState<FrameInfo[]>([]);
  const videoRef = React.useRef<VideoRef | null>(null);
  
  // Reanimated shared values for thumb positions (as percentages)
  const startPercent = useSharedValue(0);
  const endPercent = useSharedValue(100);

  const getSelection = () => thumbs;
  React.useImperativeHandle(ref, () => ({
    getSelection,
  }));

  const seek = (time: number | undefined) => {
    if (videoRef && videoRef.current && time !== undefined) {
      videoRef.current.seek(time);
    }
  };

  // Update shared values when thumbs change
  useEffect(() => {
    if (duration > 0) {
      startPercent.value = (thumbs[0] / duration) * 100;
      endPercent.value = (thumbs[1] / duration) * 100;
    }
  }, [thumbs, duration, startPercent, endPercent]);

  const onSlidingComplete = (value: number[], thumb: number) => {
    let [start = 0, stop = minDuration] = value || [];
    
    // Enforce minDuration constraint
    if (stop - start < minDuration) {
      if (thumb === 1) {
        // Moving end thumb - extend forward
        stop = start + minDuration;
      } else {
        // Moving start thumb - extend backward
        start = stop - minDuration;
        if (start < 0) {
          start = 0;
          stop = minDuration;
        }
      }
    }
    
    // Enforce maxDuration constraint if provided
    if (maxDuration !== undefined) {
      const trimmedDuration = stop - start;
      if (trimmedDuration > maxDuration) {
        // Adjust based on which thumb was moved
        if (thumb === 1) {
          // End thumb was moved - limit from start position
          stop = start + maxDuration;
          // Ensure stop doesn't exceed video duration
          if (stop > duration) {
            stop = duration;
            start = Math.max(0, stop - maxDuration);
          }
        } else {
          // Start thumb was moved - limit from end position
          start = stop - maxDuration;
          // Ensure start doesn't go below 0
          if (start < 0) {
            start = 0;
            stop = Math.min(maxDuration, duration);
          }
        }
      }
    }
    
    // Ensure values are within video bounds
    start = Math.max(0, start);
    stop = Math.min(stop, duration);
    
    start = parseFloat(start.toFixed(1));
    stop = stop === duration ? duration : parseFloat(stop.toFixed(1));
    setThumbs([start, stop]);
    
    if (onSelected) onSelected(start, stop);
    seek(start);
  };
  
  // Handle real-time updates during dragging
  const onValueChange = (value: number[]) => {
    const [start = 0, stop = minDuration] = value || [];
    // Update shared values in real-time during dragging
    if (duration > 0) {
      startPercent.value = (start / duration) * 100;
      endPercent.value = (stop / duration) * 100;
    }
  };

  const onEnd = () => {
    if (loop) {
      seek(thumbs[0]);
    }
  };

  const onLoad = (data: OnLoadData) => {
    // console.info('duration', data.duration);
    if (duration) {
      if (thumbs[0] !== 0) {
        seek(thumbs[0]);
      }
      return;
    }
    const videoDuration = data.duration;
    setDuration(videoDuration);
    
    // Set initial thumbs, respecting maxDuration if provided
    let initialEnd = videoDuration;
    if (maxDuration !== undefined) {
      initialEnd = Math.min(videoDuration, maxDuration);
    }
    setThumbs([0, initialEnd]);
    
    // Update shared values for initial position
    startPercent.value = 0;
    endPercent.value = (initialEnd / videoDuration) * 100;
    
    seek(0);

    // Extract frames from video - extract frames for thumbnail preview
    // Limit to reasonable count for performance (max 10 frames, or 1 per 2 seconds)
    const frameCount = Math.min(10, Math.max(5, Math.floor(videoDuration / 2)));
    if (source && 'uri' in source && source.uri && typeof source.uri === 'string') {
      extractFrames(source.uri, videoDuration, frameCount).then((extractedFrames) => {
        setFrames(extractedFrames);
      }).catch((error) => {
        console.warn('Failed to extract frames:', error);
      });
    }
  };

  const onProgress = ({ currentTime }: OnProgressData) => {
    if (currentTime > thumbs[1]) {
      if (loop) {
        seek(thumbs[0]);
      }
    }
    setPlaybackTime(currentTime);
  };

  return (
    <View style={[videoTrimmerStyles.container, containerStyle]}>
      <Video
        style={videoTrimmerStyles.video}
        key={`video-${loop}`}
        ref={videoRef}
        source={source}
        onProgress={onProgress}
        onEnd={onEnd}
        onLoad={onLoad}
      />
      {duration ? (
        <View style={videoTrimmerStyles.slider}>
          <Slider
            style={sliderContainerStyle}
            thumbs={thumbs}
            duration={duration}
            playbackTime={playbackTime}
            onSlidingComplete={onSlidingComplete}
            onValueChange={onValueChange}
            tintColor={tintColor}
            maxDuration={maxDuration}
            frames={frames}
            startPercent={startPercent}
            endPercent={endPercent}
          />
        </View>
      ) : null}
    </View>
  );
}

export default forwardRef<VideoTrimmerRef, VideoTrimmerProps>(VideoTrimmerUI);
