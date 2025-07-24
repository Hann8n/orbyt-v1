import React, { useRef, useEffect, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  Modal,
  StatusBar,
  SafeAreaView,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { isSmallScreen, isTablet } from '../../../../utils/helpers/screenSize';
import { BRAND } from '../../../../utils/formatting/Colors';
import VideoCard from '../VideoCard';
import VideoOverlay from '../VideoOverlay';
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
      playlist: [videoPath],
      aspectRatio: { width: 9, height: 16 },
    },
  };

  // Responsive layout
  const isSmallDevice = isSmallScreen() || isTablet();
  const scrollY = useSharedValue(0);
  const videoCardRef = useRef<VideoCardRef>(null);

  // On mount or when visible, seek to initialTime and set play state
  useEffect(() => {
    if (visible && videoCardRef.current) {
      if (initialTime > 0) {
        // Seek to initialTime (fraction)
        const duration = videoCardRef.current.getDuration();
        if (duration > 0) {
          videoCardRef.current.seek(initialTime / duration);
        }
      }
      videoCardRef.current.playPause(!!initialIsPlaying);
    }
  }, [visible, initialTime, initialIsPlaying]);

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
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <View style={styles.videoContainer}>
            <VideoCard
              ref={videoCardRef}
              post={previewPost}
              isVisible={true}
              shouldCache={true}
              shouldDisablePlayback={false}
            />
            <View pointerEvents="none" style={{ ...StyleSheet.absoluteFillObject, opacity: 0.5 }}>
              <VideoOverlay
                post={previewPost}
                isVisible={true}
                scrollY={scrollY}
              />
            </View>
          </View>
        </View>
      ) : (
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={styles.videoContainer}>
            <VideoCard
              ref={videoCardRef}
              post={previewPost}
              isVisible={true}
              shouldCache={true}
              shouldDisablePlayback={false}
            />
            <View pointerEvents="none" style={{ ...StyleSheet.absoluteFillObject, opacity: 0.5 }}>
              <VideoOverlay
                post={previewPost}
                isVisible={true}
                scrollY={scrollY}
              />
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
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default VideoPreviewModal; 