import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
  StatusBar,
  SafeAreaView,
} from 'react-native';
import Video from 'react-native-video';
import { Ionicons } from '@expo/vector-icons';
import { BRAND, TEXT, INTERACTIVE, PROFILE } from '../../../../utils/formatting/Colors';
import VideoPreviewOverlay from './VideoPreviewOverlay';
import { TextOverlay } from '../../../../navigation/types';
import { useNavigation } from '@react-navigation/native';
import { isSmallScreen } from '../../../../utils/helpers/screenSize';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface VideoPreviewModalProps {
  visible: boolean;
  onClose: (currentTime?: number, isPlaying?: boolean) => void;
  videoPath: string;
  description?: string;
  userProfile?: any;
  textOverlays?: TextOverlay[];
  contentWarnings?: string[];
  commentFilter?: string;
  initialTime?: number;
  initialIsPlaying?: boolean;
}

const VideoPreviewModal: React.FC<VideoPreviewModalProps> = ({
  visible,
  onClose,
  videoPath,
  description,
  userProfile,
  textOverlays = [],
  contentWarnings = [],
  commentFilter = 'all',
  initialTime = 0,
  initialIsPlaying = true,
}) => {
  const [isPlaying, setIsPlaying] = useState(initialIsPlaying);
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number }>({ width: 360, height: 640 });
  const [currentTime, setCurrentTime] = useState(initialTime);
  const videoRef = useRef<any>(null);
  const navigation = useNavigation();
  const isSmallDevice = isSmallScreen();

  React.useEffect(() => {
    if (visible) {
      setIsPlaying(initialIsPlaying);
      setCurrentTime(initialTime);
    }
  }, [visible, initialTime, initialIsPlaying]);

  // Calculate max preview area (100% of screen width and height)
  const maxWidth = SCREEN_WIDTH;
  const maxHeight = SCREEN_HEIGHT;
  const aspectRatio = videoDimensions.width / videoDimensions.height;
  let containerWidth = maxWidth;
  let containerHeight = containerWidth / aspectRatio;
  if (containerHeight > maxHeight) {
    containerHeight = maxHeight;
    containerWidth = containerHeight * aspectRatio;
  }

  // Create a mock post object for the overlay
  const mockPost = {
    uri: 'preview-post',
    cid: 'preview-cid',
    author: {
      avatar: userProfile?.avatar,
      displayName: userProfile?.displayName || userProfile?.handle,
      handle: userProfile?.handle,
      did: userProfile?.did,
      profileColors: userProfile?.profileColors,
    },
    record: {
      text: description,
    },
    viewer: {
      like: undefined,
      repost: undefined,
    },
    likeCount: 0,
    repostCount: 0,
    replyCount: 0,
    embed: {
      $type: 'app.bsky.embed.video#view',
      playlist: [videoPath],
    },
  };

  const handleVideoPress = () => {
    setIsPlaying(!isPlaying);
  };

  const handleClose = () => {
    onClose(currentTime, isPlaying);
  };

  // Helper to scale overlay positions to video size
  const getOverlayPosition = (overlay: TextOverlay) => {
    // If overlay.position is normalized (0-1), scale to video container
    // If not, fallback to raw values
    return {
      left: overlay.position.x * containerWidth,
      top: overlay.position.y * containerHeight,
      transform: [{ scale: overlay.scale }],
      opacity: 0.5,
      position: 'absolute' as const,
      zIndex: 2,
      padding: 8,
      minWidth: 50,
    };
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" />
      {isSmallDevice ? (
        <View style={styles.container}>
          {/* Floating close button for small screens */}
          <TouchableOpacity onPress={handleClose} style={styles.floatingCloseButton}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>

          <View style={[styles.videoContainer, { justifyContent: 'center', alignItems: 'center' }]}> 
            <TouchableOpacity 
              onPress={() => setIsPlaying(!isPlaying)} 
              style={{ width: containerWidth, height: containerHeight, justifyContent: 'center', alignItems: 'center', alignSelf: 'center' }}
              activeOpacity={1}
            >
              <Video
                ref={videoRef}
                source={{ uri: videoPath }}
                style={{ width: containerWidth, height: containerHeight, backgroundColor: '#111', borderRadius: 15 }}
                resizeMode="contain"
                paused={!isPlaying}
                repeat={true}
                onError={(error) => console.error('Video error:', error)}
                onLoad={e => {
                  if (e?.naturalSize?.width && e?.naturalSize?.height) {
                    setVideoDimensions({ width: e.naturalSize.width, height: e.naturalSize.height });
                  }
                  // Seek to initialTime if not at start
                  if (currentTime > 0 && videoRef.current && videoRef.current.seek) {
                    videoRef.current.seek(currentTime);
                  }
                }}
                onProgress={status => {
                  if (status?.currentTime !== undefined) {
                    setCurrentTime(status.currentTime);
                  }
                }}
              />
              {/* Text Overlays with 50% opacity, positioned relative to video */}
              {textOverlays && textOverlays.length > 0 && textOverlays.map((overlay: TextOverlay) => (
                <View
                  key={overlay.id}
                  style={getOverlayPosition(overlay)}
                  pointerEvents="none"
                >
                  <Text
                    style={[
                      styles.textOverlay,
                      { 
                        fontFamily: overlay.fontFamily,
                        color: overlay.color
                      }
                    ]}
                  >
                    {overlay.text}
                  </Text>
                </View>
              ))}
              {/* Play/Pause indicator */}
              {!isPlaying && (
                <View style={styles.playIndicator}>
                  <Ionicons name="play" size={50} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
            {/* Video Overlay with 50% opacity */}
            <View style={styles.overlayContainer} pointerEvents="none">
              <VideoPreviewOverlay post={mockPost} />
            </View>
          </View>
        </View>
      ) : (
        <SafeAreaView style={styles.container}>
          {/* Header with close button on the left for larger screens */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={[styles.videoContainer, { justifyContent: 'center', alignItems: 'center' }]}> 
            <TouchableOpacity 
              onPress={() => setIsPlaying(!isPlaying)} 
              style={{ width: containerWidth, height: containerHeight, justifyContent: 'center', alignItems: 'center', alignSelf: 'center' }}
              activeOpacity={1}
            >
              <Video
                ref={videoRef}
                source={{ uri: videoPath }}
                style={{ width: containerWidth, height: containerHeight, backgroundColor: '#111', borderRadius: 15 }}
                resizeMode="contain"
                paused={!isPlaying}
                repeat={true}
                onError={(error) => console.error('Video error:', error)}
                onLoad={e => {
                  if (e?.naturalSize?.width && e?.naturalSize?.height) {
                    setVideoDimensions({ width: e.naturalSize.width, height: e.naturalSize.height });
                  }
                  // Seek to initialTime if not at start
                  if (currentTime > 0 && videoRef.current && videoRef.current.seek) {
                    videoRef.current.seek(currentTime);
                  }
                }}
                onProgress={status => {
                  if (status?.currentTime !== undefined) {
                    setCurrentTime(status.currentTime);
                  }
                }}
              />
              {/* Text Overlays with 50% opacity, positioned relative to video */}
              {textOverlays && textOverlays.length > 0 && textOverlays.map((overlay: TextOverlay) => (
                <View
                  key={overlay.id}
                  style={getOverlayPosition(overlay)}
                  pointerEvents="none"
                >
                  <Text
                    style={[
                      styles.textOverlay,
                      { 
                        fontFamily: overlay.fontFamily,
                        color: overlay.color
                      }
                    ]}
                  >
                    {overlay.text}
                  </Text>
                </View>
              ))}
              {/* Play/Pause indicator */}
              {!isPlaying && (
                <View style={styles.playIndicator}>
                  <Ionicons name="play" size={50} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
            {/* Video Overlay with 50% opacity */}
            <View style={styles.overlayContainer} pointerEvents="none">
              <VideoPreviewOverlay post={mockPost} />
            </View>
          </View>
        </SafeAreaView>
      )}
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 15,
    paddingVertical: 10,
    zIndex: 10,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  floatingCloseButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  videoContainer: {
    flex: 1,
    position: 'relative',
  },
  videoWrapper: {
    flex: 1,
    position: 'relative',
  },
  video: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  textOverlayContainer: {
    position: 'absolute',
    padding: 8,
    minWidth: 50,
    zIndex: 2,
  },
  textOverlay: {
    fontSize: 22,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
    padding: 4,
  },
  playIndicator: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -25,
    marginTop: -25,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  overlayContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    opacity: 0.5,
  },
});

export default VideoPreviewModal; 