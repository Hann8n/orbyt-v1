import React, { useRef, useEffect, useCallback, useState } from 'react';
import { BORDER_RADIUS } from '../../../../utils/constants';
import {
  View,
  TouchableOpacity,
  Modal,
  StatusBar,
  StyleSheet,
  Dimensions,
  Text,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Icon from '../../../ui/Icon';
import { isSmallScreen, isTablet } from '../../../../utils/helpers/screenSize';
import { Colors } from '../../../ui/UI';
import VideoCard from '../VideoCard';

import { useSharedValue } from 'react-native-reanimated';
import type { VideoCardRef } from '../VideoCard';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface VideoPreviewModalProps {
  visible: boolean;
  onClose: (currentTime?: number, isPlaying?: boolean) => void;
  videoPath: string;
  description?: string;
  userProfile?: any;
  initialTime?: number;
  initialIsPlaying?: boolean;
}

const VideoPreviewModal: React.FC<VideoPreviewModalProps> = ({
  visible,
  onClose,
  videoPath,
  description,
  userProfile,
  initialTime = 0,
  initialIsPlaying = true,
}) => {
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const videoCardRef = useRef<VideoCardRef>(null);

  // Ensure videoPath is properly formatted
  const formattedVideoPath = videoPath.startsWith('file://') ? videoPath : `file://${videoPath}`;

  // Construct a preview post object
  const previewPost = {
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
    viewer: {},
    likeCount: 0,
    repostCount: 0,
    replyCount: 0,
    embed: {
      $type: 'app.bsky.embed.video#view',
      playlist: formattedVideoPath, // Use string instead of array
      aspectRatio: { width: 9, height: 16 },
    },
  };

  // Responsive layout
  const isSmallDevice = isSmallScreen() || isTablet();
  const scrollY = useSharedValue(0);

  // Handle video status changes
  const handleVideoStatus = useCallback((uri: string, status: string) => {

    
    if (status === 'ready') {
      setIsVideoReady(true);
      setVideoError(null);
      
      // Now that video is ready, set initial time and play state
      if (videoCardRef.current) {
        if (initialTime > 0) {
          const duration = videoCardRef.current.getDuration();
          if (duration > 0) {
            videoCardRef.current.seek(initialTime / duration);
          }
        }
        videoCardRef.current.playPause(!!initialIsPlaying);
      }
    } else if (status === 'error') {
      setVideoError('Failed to load video');
      setIsVideoReady(false);
    } else if (status === 'loading') {
      setVideoError(null);
      setIsVideoReady(false);
    }
  }, [initialTime, initialIsPlaying]);

  // Reset state when modal becomes visible
  useEffect(() => {
    if (visible) {
      setVideoError(null);
      setIsVideoReady(false);
    }
  }, [visible]);

  // Toggle play/pause on tap
  const handleVideoTap = useCallback(() => {
    if (videoCardRef.current) {
      const isPlaying = videoCardRef.current.getPlayState();
      videoCardRef.current.playPause(!isPlaying);
    }
  }, []);

  // On close, return current time and play state
  const handleClose = useCallback(() => {
    if (videoCardRef.current) {
      const currentTime = videoCardRef.current.getCurrentTime();
      const isPlaying = videoCardRef.current.getPlayState();
      onClose(currentTime, isPlaying);
    } else {
      onClose();
    }
  }, [onClose]);

  // Show error state
  if (videoError) {
    return (
      <Modal
        visible={visible}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={handleClose}
      >
        <StatusBar barStyle="light-content" backgroundColor="transparent" />
        <View style={styles.container}>
          <TouchableOpacity onPress={handleClose} style={styles.floatingCloseButton}>
            <Icon name="close" size={20} color={Colors.lightGray} />
          </TouchableOpacity>
          <View style={styles.errorContainer}>
            <Icon name="alert-circle" size={60} color={Colors.white} />
            <Text style={styles.errorText}>{videoError}</Text>
            <Text style={styles.errorSubtext}>Please try again or select a different video.</Text>
          </View>
        </View>
      </Modal>
    );
  }

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
          <TouchableOpacity onPress={handleClose} style={styles.floatingCloseButton}>
            <Icon name="close" size={20} color={Colors.lightGray} />
          </TouchableOpacity>
          <View style={styles.videoContainer}>
            <VideoCard
              ref={videoCardRef}
              post={previewPost}
              isVisible={true}
              shouldCache={true}
              shouldDisablePlayback={false}
              onVideoStatus={handleVideoStatus}
              height={Dimensions.get('window').height}
              isPlaying={true}
              showOverlay={true}
              isModal={true}
            />
            {!isVideoReady && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={Colors.white} />
                <Text style={styles.loadingText}>Loading video...</Text>
              </View>
            )}
          </View>
        </View>
      ) : (
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Icon name="close" size={20} color={Colors.lightGray} />
            </TouchableOpacity>
          </View>
          <View style={styles.videoContainer}>
            <VideoCard
              ref={videoCardRef}
              post={previewPost}
              isVisible={true}
              shouldCache={true}
              shouldDisablePlayback={false}
              onVideoStatus={handleVideoStatus}
              height={Dimensions.get('window').height}
              isPlaying={true}
              showOverlay={true}
              isModal={true}
            />
            {!isVideoReady && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={Colors.white} />
                <Text style={styles.loadingText}>Loading video...</Text>
              </View>
            )}
          </View>
        </SafeAreaView>
      )}
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
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
    borderRadius: BORDER_RADIUS.LARGE,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.black,
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
    borderRadius: BORDER_RADIUS.LARGE,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  videoContainer: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    zIndex: 5,
  },
  loadingText: {
    color: Colors.white,
    fontSize: 16,
    marginTop: 10,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 20,
    textAlign: 'center',
  },
  errorSubtext: {
    color: Colors.white,
    fontSize: 14,
    marginTop: 10,
    textAlign: 'center',
  },
});

export default VideoPreviewModal;