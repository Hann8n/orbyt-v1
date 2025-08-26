import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BORDER_RADIUS } from '../../../utils/constants';
import {
  View,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Text,
  NativeEventEmitter,
  NativeModules,
  Platform,
  Alert,
  Modal,
  TextInput
} from 'react-native';
import Video, { VideoRef } from 'react-native-video';
import { Colors } from '../../ui/UI';
import VideoProcessingService from '../../../services/VideoProcessingService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Check if VideoTrim native module exists
const VideoTrim = NativeModules.VideoTrim;

interface VideoFile {
  uri: string;
  trimStart?: number;
  trimEnd?: number;
  duration?: number;
}

interface VideoEditorComponentProps {
  style?: any;
  videoFiles: VideoFile[];
  onDurationChange?: (duration: number) => void;
  showControls?: boolean;
  autoPlay?: boolean;
  loop?: boolean;
  onTrimComplete?: (uri: string) => void;
}

// Helper function to format time in MM:SS format
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

const VideoEditorComponent: React.FC<VideoEditorComponentProps> = ({
  style,
  videoFiles,
  onDurationChange,
  showControls = true,
  autoPlay = true,
  loop = true,
  onTrimComplete
}) => {
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [segmentDurations, setSegmentDurations] = useState<number[]>([]);
  const videoRef = useRef<VideoRef>(null);
  
  // For trimming
  const [currentTrimStart, setCurrentTrimStart] = useState(0);
  const [currentTrimEnd, setCurrentTrimEnd] = useState(0);
  
  // New state for overlay text functionality
  const [overlayText, setOverlayText] = useState('');
  const [isEditingText, setIsEditingText] = useState(false);
  const [tempOverlayText, setTempOverlayText] = useState('');

  // Calculate total duration when videoFiles change
  useEffect(() => {
    if (!videoFiles.length) return;
    
    // Calculate all segment durations
    const durations = videoFiles.map(file => {
      const start = file.trimStart || 0;
      const end = file.trimEnd || file.duration || 0;
      return end - start;
    });
    
    setSegmentDurations(durations);
    
    // Calculate total duration
    const total = durations.reduce((sum, duration) => sum + duration, 0);
    setTotalDuration(total);
    
    if (onDurationChange) {
      onDurationChange(total);
    }
    
    // Set initial trim positions for current segment
    if (videoFiles[0]) {
      const currentFile = videoFiles[0];
      setCurrentTrimStart(currentFile.trimStart || 0);
      setCurrentTrimEnd(currentFile.trimEnd || currentFile.duration || 0);
    }
  }, [videoFiles, onDurationChange]);

  // Set up event listener for VideoTrim
  useEffect(() => {
    // Only set up event listener if VideoTrim module exists
    if (VideoTrim && onTrimComplete) {
      // Create event emitter only if VideoTrim module exists
      const eventEmitter = new NativeEventEmitter(VideoTrim);
      const subscription = eventEmitter.addListener('VideoTrim', (event: any) => {
        switch (event.name) {
          case 'onFinishTrimming':
            if (event.outputURL) {
              onTrimComplete(event.outputURL);
            }
            break;
          case 'onError':
      
            break;
        }
      });

      return () => {
        subscription.remove();
      };
    }
    // Return empty cleanup function if VideoTrim doesn't exist
    return () => {};
  }, [onTrimComplete]);

  // Handle video loading
  const handleLoad = (data: any) => {
    const videoDuration = data.duration;
    const currentFile = videoFiles[currentSegmentIndex];
    
    // Update segment duration if not already set
    if (!currentFile.duration) {
      const newSegmentDurations = [...segmentDurations];
      newSegmentDurations[currentSegmentIndex] = videoDuration;
      setSegmentDurations(newSegmentDurations);
      
      // Recalculate total duration
      const newTotal = newSegmentDurations.reduce((sum, duration) => sum + duration, 0);
      setTotalDuration(newTotal);
      
      if (onDurationChange) {
        onDurationChange(newTotal);
      }
      
      // Set trim end to full duration if not specified
      if (currentFile.trimEnd === undefined) {
        setCurrentTrimEnd(videoDuration);
      }
    }
    
    // Apply trim settings if available
    if (currentFile.trimStart !== undefined && videoRef.current) {
      videoRef.current.seek(currentFile.trimStart);
    }
  };

  // Handle video progress
  const handleProgress = (data: any) => {
    if (!videoFiles.length) return;
    
    const currentTime = data.currentTime;
    const currentFile = videoFiles[currentSegmentIndex];
    const trimEnd = currentFile.trimEnd || data.playableDuration;
    
    // Check if we need to move to the next segment
    if (trimEnd !== undefined && currentTime >= trimEnd) {
      moveToNextSegment();
    }
    
    setCurrentPosition(currentTime);
  };

  // Handle video end
  const handleEnd = () => {
    moveToNextSegment();
  };

  // Move to next segment
  const moveToNextSegment = useCallback(() => {
    if (currentSegmentIndex < videoFiles.length - 1) {
      // Move to next segment
      setCurrentSegmentIndex(prev => prev + 1);
    } else if (loop) {
      // If at the last segment and loop is enabled, go back to first segment
      setCurrentSegmentIndex(0);
    } else {
      // If at the last segment and not looping, pause
      setIsPlaying(false);
    }
  }, [currentSegmentIndex, videoFiles.length, loop]);

  // Play/pause toggle
  const togglePlayback = () => {
    setIsPlaying(!isPlaying);
  };

  // Show trimming interface using react-native-video-trim
  const showTrimmer = () => {
    if (!videoFiles.length) return;
    
    // Check if VideoTrim module exists
    if (!VideoTrim) {
      Alert.alert(
        "Trimming Not Available", 
        "Video trimming functionality is not available on this device.",
        [{ text: "OK" }]
      );
      return;
    }
    
    // Use the current video file for trimming
    const currentFile = videoFiles[currentSegmentIndex];
    
    if (!currentFile?.uri) return;
    
    VideoTrim.showEditor(currentFile.uri, {
      maxDuration: 60, // Max duration in seconds
      autoPlay: true,
      progressUpdateInterval: 0.1, // Progress update interval in seconds
      closeWhenFinish: true, // Close editor when trimming finishes
    });
  };

  const openTextModal = () => {
    setTempOverlayText(overlayText); // Initialize temporary text with the current overlay text
    setIsEditingText(true);
  };

  // Method to merge multiple video files
  const mergeVideoFiles = async (files: VideoFile[]): Promise<VideoFile> => {
    try {
      // Convert VideoFile array to VideoSegment array for processing
      const segments = files.map((file, index) => ({
        startTime: index * (file.duration || 0),
        duration: file.duration || 0,
        video: {
          path: file.uri,
          duration: file.duration || 0,
          width: 1080,
          height: 1920,
        },
        sourceType: 'camera' as const,
      }));

      const mergedVideo = await VideoProcessingService.mergeSegments(segments);
      return {
        uri: mergedVideo.path,
        duration: mergedVideo.duration,
      };
    } catch (error) {
      console.error('Error merging video files:', error);
      throw error;
    }
  };

  return (
    <View style={[styles.container, style]}>
      <Video
        ref={videoRef}
        source={{ uri: videoFiles[currentSegmentIndex]?.uri }}
        style={styles.video}
        resizeMode="contain"
        onLoad={handleLoad}
        onProgress={handleProgress}
        onEnd={handleEnd}
        paused={!isPlaying}
        repeat={false} // We handle our own loop logic
      />
      
      {/* Overlay for added text on video */}
      {overlayText ? (
        <View style={styles.overlayTextContainer} pointerEvents="none">
          <Text style={styles.overlayText}>{overlayText}</Text>
        </View>
      ) : null}

      {/* Button to add/edit overlay text */}
      <View style={styles.addTextButtonContainer}>
        <TouchableOpacity onPress={openTextModal} style={styles.addTextButton}>
          <Text style={styles.addTextButtonLabel}>{overlayText ? 'edit text' : 'add text'}</Text>
        </TouchableOpacity>
      </View>

      {/* Modal for editing overlay text */}
      <Modal
        transparent
        animationType="fade"
        visible={isEditingText}
        onRequestClose={() => setIsEditingText(false)}>
        <View style={styles.modalBackground}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Enter Overlay Text</Text>
            <TextInput
              style={styles.modalTextInput}
              value={tempOverlayText}
              onChangeText={setTempOverlayText}
              placeholder="Type your text here..."
              placeholderTextColor={Colors.lightGray}
            />
            <View style={styles.modalButtonsContainer}>
              <TouchableOpacity
                onPress={() => setIsEditingText(false)}
                style={styles.modalButton}>
                <Text style={styles.modalButtonLabel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setOverlayText(tempOverlayText);
                  setIsEditingText(false);
                }}
                style={styles.modalButton}>
                <Text style={styles.modalButtonLabel}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Simplified Playback Controls */}
      {showControls && (
        <View style={styles.controlsContainer}>
          <TouchableOpacity onPress={togglePlayback} style={styles.controlButton}>
            <Text style={styles.controlText}>
              {isPlaying ? '❚❚' : '▶'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      
      {/* Time indicator */}
      <View style={styles.timeIndicator}>
        <Text style={styles.timeText}>
          {formatTime(currentPosition)} / {formatTime(videoFiles[currentSegmentIndex]?.duration || 0)}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  video: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlayTextContainer: {
    position: 'absolute',
    top: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  overlayText: {
    color: Colors.white,
    fontSize: 24,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  addTextButtonContainer: {
    position: 'absolute',
    top: 80,
    right: 20,
  },
  addTextButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: BORDER_RADIUS.SMALL,
  },
  addTextButtonLabel: {
    color: Colors.white,
    fontSize: 14,
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
  },
  controlButton: {
    width: 50,
    height: 50,
    borderRadius: BORDER_RADIUS.MEDIUM,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 10,
  },
  controlText: {
    color: Colors.white,
    fontSize: 18,
  },
  timeIndicator: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 15,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
  timeText: {
    color: Colors.white,
    fontSize: 12,
  },
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '80%',
    backgroundColor: Colors.white,
    borderRadius: BORDER_RADIUS.SMALL,
    padding: 20,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    marginBottom: 12,
    color: Colors.mediumGray,
  },
  modalTextInput: {
    width: '100%',
    borderColor: Colors.white,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.SMALL,
    padding: 10,
    marginBottom: 20,
    color: Colors.mediumGray,
  },
  modalButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  modalButton: {
    flex: 1,
    marginHorizontal: 5,
    paddingVertical: 10,
    backgroundColor: Colors.darkGray,  // Using the app's brand color for consistency
    borderRadius: BORDER_RADIUS.SMALL,
    alignItems: 'center',
  },
  modalButtonLabel: {
    color: Colors.white,
    fontSize: 16,
  },
});

export default VideoEditorComponent;