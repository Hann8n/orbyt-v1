import React, { forwardRef, useState, useEffect, useCallback, type Ref } from 'react';
import { View, type ViewStyle, Dimensions } from 'react-native';
import { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
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
  onValueChange?: (start: number, end: number) => void;
  minDuration?: number;
  maxDuration?: number;
  videoWidth?: number;
  videoHeight?: number;
  onCropPositionChange?: (x: number, y: number) => void;
}

export interface VideoTrimmerRef {
  getSelection: () => [number, number];
  getCropPosition: () => { x: number; y: number };
}

const MIN_DURATION = 1;

// Worklet function to calculate pan constraints
const getPanConstraintsWorklet = (cw: number, ch: number, vw: number, vh: number) => {
  'worklet';
  const targetAspectRatio = 9 / 16;
  const sourceAspectRatio = vw / vh;
  
  if (cw === 0 || ch === 0) {
    return { maxOffsetX: 1, maxOffsetY: 1 };
  }
  
  if (sourceAspectRatio > targetAspectRatio) {
    // Video is wider than 9:16 - crop width, pan horizontally
    const scaleX = ch / vh;
    const scaledVideoWidth = vw * scaleX;
    const panRange = (scaledVideoWidth - cw) / scaleX;
    const maxNormalizedOffset = panRange > 0 ? Math.min(1, panRange / vw) : 0;
    return { maxOffsetX: maxNormalizedOffset, maxOffsetY: 0 };
  } else {
    // Video is taller than 9:16 - crop height, pan vertically
    const scaleY = cw / vw;
    const scaledVideoHeight = vh * scaleY;
    const panRange = (scaledVideoHeight - ch) / scaleY;
    const maxNormalizedOffset = panRange > 0 ? Math.min(1, panRange / vh) : 0;
    return { maxOffsetX: 0, maxOffsetY: maxNormalizedOffset };
  }
};

function VideoTrimmerUI(props: VideoTrimmerProps, ref: Ref<unknown>) {
  const {
    containerStyle,
    source,
    loop = true,
    sliderContainerStyle,
    tintColor = '#4528ea',
    onSelected,
    onValueChange,
    minDuration = MIN_DURATION,
    maxDuration,
    videoWidth = 1080,
    videoHeight = 1920,
    onCropPositionChange,
  } = props;
  const [playbackTime, setPlaybackTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [thumbs, setThumbs] = useState<[number, number]>([0, 0]);
  const [frames, setFrames] = useState<FrameInfo[]>([]);
  const videoRef = React.useRef<VideoRef | null>(null);
  const containerRef = React.useRef<View>(null);
  
  // Reanimated shared values for thumb positions (as percentages)
  const startPercent = useSharedValue(0);
  const endPercent = useSharedValue(100);
  
  // Container dimensions as shared values for use in worklets
  const containerWidth = useSharedValue(0);
  const containerHeight = useSharedValue(0);
  
  // Crop position tracking (normalized offset: -1 to 1, where 0 is centered)
  const cropOffsetX = useSharedValue(0);
  const cropOffsetY = useSharedValue(0);
  const isPanning = useSharedValue(false);

  const getSelection = () => thumbs;
  const getCropPosition = () => ({
    x: cropOffsetX.value,
    y: cropOffsetY.value,
  });
  
  React.useImperativeHandle(ref, () => ({
    getSelection,
    getCropPosition,
  }));
  
  // Container dimensions state for layout calculations (not used in worklets)
  const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 });
  
  // Calculate video wrapper size to accommodate overflow
  const videoWrapperSize = React.useMemo(() => {
    if (containerDimensions.width === 0 || containerDimensions.height === 0) {
      return { width: 0, height: 0 };
    }
    
    const targetAspectRatio = 9 / 16;
    const sourceAspectRatio = videoWidth / videoHeight;
    const containerAspectRatio = containerDimensions.width / containerDimensions.height;
    
    // In cover mode, video scales to fill the container
    if (sourceAspectRatio > targetAspectRatio) {
      // Video is wider - scale to fill height, width extends beyond
      const scale = containerDimensions.height / videoHeight;
      const scaledVideoWidth = videoWidth * scale;
      return { 
        width: scaledVideoWidth, 
        height: containerDimensions.height 
      };
    } else {
      // Video is taller - scale to fill width, height extends beyond
      const scale = containerDimensions.width / videoWidth;
      const scaledVideoHeight = videoHeight * scale;
      return { 
        width: containerDimensions.width, 
        height: scaledVideoHeight 
      };
    }
  }, [containerDimensions, videoWidth, videoHeight]);

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
  const handleValueChange = (value: number[]) => {
    const [start = 0, stop = minDuration] = value || [];
    // Update shared values in real-time during dragging
    if (duration > 0) {
      startPercent.value = (start / duration) * 100;
      endPercent.value = (stop / duration) * 100;
    }
    // Call external onValueChange callback if provided
    if (onValueChange) {
      onValueChange(start, stop);
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
  
  // Track the starting offset when pan begins
  const panStartOffsetX = useSharedValue(0);
  const panStartOffsetY = useSharedValue(0);
  
  // Pan gesture handler
  const panGesture = Gesture.Pan()
    .onStart(() => {
      'worklet';
      isPanning.value = true;
      panStartOffsetX.value = cropOffsetX.value;
      panStartOffsetY.value = cropOffsetY.value;
    })
    .onUpdate((e) => {
      'worklet';
      const cw = containerWidth.value;
      const ch = containerHeight.value;
      const vw = videoWidth;
      const vh = videoHeight;
      
      // Get constraints using worklet function
      const constraints = getPanConstraintsWorklet(cw, ch, vw, vh);
      
      if (constraints.maxOffsetX > 0) {
        // Horizontal panning - video follows finger (positive translation = video moves right)
        const normalizedDeltaX = e.translationX / (cw * 0.5);
        const newOffsetX = Math.max(-constraints.maxOffsetX, Math.min(constraints.maxOffsetX, panStartOffsetX.value + normalizedDeltaX));
        cropOffsetX.value = newOffsetX;
        cropOffsetY.value = 0;
      } else if (constraints.maxOffsetY > 0) {
        // Vertical panning - video follows finger (positive translation = video moves down)
        const normalizedDeltaY = e.translationY / (ch * 0.5);
        const newOffsetY = Math.max(-constraints.maxOffsetY, Math.min(constraints.maxOffsetY, panStartOffsetY.value + normalizedDeltaY));
        cropOffsetY.value = newOffsetY;
        cropOffsetX.value = 0;
      }
      
      // Notify parent of crop position change (normalized -1 to 1)
      if (onCropPositionChange) {
        runOnJS(onCropPositionChange)(cropOffsetX.value, cropOffsetY.value);
      }
    })
    .onEnd(() => {
      'worklet';
      isPanning.value = false;
    });
  
  // Animated style for guidelines overlay
  const guidelinesOpacity = useAnimatedStyle(() => ({
    opacity: isPanning.value ? withTiming(1, { duration: 150 }) : withTiming(0, { duration: 300 }),
  }));
  
  // Animated style for video transform - video follows finger (positive offset = positive transform)
  const videoTransformStyle = useAnimatedStyle(() => {
    'worklet';
    const cw = containerWidth.value;
    const ch = containerHeight.value;
    const vw = videoWidth;
    const vh = videoHeight;
    
    if (cw === 0 || ch === 0) {
      return {};
    }
    
    const targetAspectRatio = 9 / 16;
    const sourceAspectRatio = vw / vh;
    
    // Calculate how video is scaled in cover mode
    let scale: number;
    let scaledVideoWidth: number;
    let scaledVideoHeight: number;
    
    if (sourceAspectRatio > targetAspectRatio) {
      // Video is wider than 9:16 - scale to fill height, width extends beyond
      scale = ch / vh;
      scaledVideoWidth = vw * scale;
      scaledVideoHeight = ch;
    } else {
      // Video is taller than 9:16 - scale to fill width, height extends beyond
      scale = cw / vw;
      scaledVideoWidth = cw;
      scaledVideoHeight = vh * scale;
    }
    
    // Calculate how much video extends beyond container (for panning range)
    const overflowX = Math.max(0, (scaledVideoWidth - cw) / 2);
    const overflowY = Math.max(0, (scaledVideoHeight - ch) / 2);
    
    // Transform video: when cropOffset is positive, move video right/down (positive transform)
    // Video follows the finger direction
    const translateX = cropOffsetX.value * overflowX;
    const translateY = cropOffsetY.value * overflowY;
    
    return { transform: [{ translateX }, { translateY }] };
  });

  return (
    <View 
      ref={containerRef}
      style={[videoTrimmerStyles.container, containerStyle]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width > 0 && height > 0) {
          containerWidth.value = width;
          containerHeight.value = height;
          setContainerDimensions({ width, height });
        }
      }}
    >
      <GestureDetector gesture={panGesture}>
        <Animated.View 
          style={[
            videoTrimmerStyles.videoWrapper, 
            videoTransformStyle,
            {
              width: videoWrapperSize.width || containerDimensions.width,
              height: videoWrapperSize.height || containerDimensions.height,
              position: 'absolute',
              left: containerDimensions.width > 0 && videoWrapperSize.width > containerDimensions.width
                ? (containerDimensions.width - videoWrapperSize.width) / 2 
                : 0,
              top: containerDimensions.height > 0 && videoWrapperSize.height > containerDimensions.height
                ? (containerDimensions.height - videoWrapperSize.height) / 2
                : 0,
            }
          ]}
        >
          <Video
            style={videoTrimmerStyles.video}
            key={`video-${loop}`}
            ref={videoRef}
            source={source}
            resizeMode="cover"
            onProgress={onProgress}
            onEnd={onEnd}
            onLoad={onLoad}
          />
        </Animated.View>
      </GestureDetector>
      
      {/* Guidelines overlay */}
      <Animated.View 
        style={[
          videoTrimmerStyles.guidelinesOverlay,
          guidelinesOpacity,
          { width: containerDimensions.width || '100%', height: containerDimensions.height || '100%' }
        ]}
        pointerEvents="none"
      >
        {/* Horizontal guidelines (rule of thirds) */}
        <View style={[videoTrimmerStyles.guideline, { top: '33.33%', width: '100%' }]} />
        <View style={[videoTrimmerStyles.guideline, { top: '66.66%', width: '100%' }]} />
        {/* Vertical guidelines (rule of thirds) */}
        <View style={[videoTrimmerStyles.guideline, { left: '33.33%', height: '100%', width: 1 }]} />
        <View style={[videoTrimmerStyles.guideline, { left: '66.66%', height: '100%', width: 1 }]} />
      </Animated.View>
      
      {duration ? (
        <View style={videoTrimmerStyles.slider}>
          <Slider
            style={sliderContainerStyle}
            thumbs={thumbs}
            duration={duration}
            playbackTime={playbackTime}
            onSlidingComplete={onSlidingComplete}
            onValueChange={handleValueChange}
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
