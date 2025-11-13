import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  View,
  TouchableOpacity,
  Modal,
  StatusBar,
  StyleSheet,
  Dimensions,
  Text,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../../ui/UI';
import { BackArrowIcon, Loading3FillIcon } from '../../../ui/Icon';
import VideoCard from '../VideoCard';
import type { VideoCardRef } from '../VideoCard';
import * as Device from 'expo-device';
// import { useGlobalShareSheet, useGlobalCommentSection } from '../../../hooks/useGlobalModals';


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
  const [platformLabel, setPlatformLabel] = useState<string>('orbyt');
  const videoCardRef = useRef<VideoCardRef>(null);
  const insets = useSafeAreaInsets();

  // Simple video URI formatting
  const videoUri = videoPath && videoPath.trim() ? 
    (videoPath.startsWith('file://') ? videoPath : `file://${videoPath}`) : '';

  // Get platform-specific label
  const getOrbytPlatformLabel = async (): Promise<string> => {
    if (Platform.OS === 'ios') {
      const deviceType = await Device.getDeviceTypeAsync();
      if (deviceType === Device.DeviceType.TABLET) {
        return 'orbyt for iPad';
      } else {
        return 'orbyt for iPhone';
      }
    } else if (Platform.OS === 'android') {
      return 'orbyt for Android';
    } else if (Platform.OS === 'web') {
      return 'orbyt for Web';
    }
    return 'orbyt';
  };

  // Create simple preview post for VideoCard
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
      createdAt: new Date().toISOString(),
      metadata: {
        orbyt: true,
        platform: platformLabel,
      },
    },
    viewer: {},
    likeCount: 0,
    repostCount: 0,
    replyCount: 0,
    embed: {
      $type: 'app.bsky.embed.video#view',
      playlist: videoUri,
      aspectRatio: { width: 9, height: 16 },
    },
  };

  // Note: VideoCard handles all overlay actions internally using global hooks

  // Calculate 9:16 aspect ratio height
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const videoCardHeight = Math.min(screenWidth * (16/9), screenHeight * 0.8);

  // Simple video status handler
  const handleVideoStatus = useCallback((uri: string, status: string) => {
    if (status === 'ready') {
      setIsVideoReady(true);
      setVideoError(null);
    } else if (status === 'error') {
      setVideoError('Failed to load video');
      setIsVideoReady(false);
    } else if (status === 'loading') {
      setVideoError(null);
      setIsVideoReady(false);
    }
  }, []);

  // Simple close handler
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Reset state and fetch platform label when modal becomes visible
  useEffect(() => {
    if (visible) {
      setVideoError(null);
      setIsVideoReady(false);
      
      // Fetch platform-specific label
      getOrbytPlatformLabel().then(setPlatformLabel).catch(() => {
        setPlatformLabel('orbyt');
      });
    }
  }, [visible]);


  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" />
      <LinearGradient
        colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.1)', 'transparent']}
        locations={[0, 0.7, 1]}
        style={[styles.statusBarGradient, { height: insets.top + 60 }]}
        pointerEvents="none"
      />
      <View style={styles.container}>
        {/* Simple back button */}
        <TouchableOpacity
          onPress={handleClose}
          style={[styles.backButton, { top: insets.top + 15 }]}
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
        >
          <BackArrowIcon size={24} color={Colors.white} />
        </TouchableOpacity>
        
        {/* 9:16 VideoCard with overlay */}
        <View style={styles.videoContainer}>
          {videoUri ? (
            <VideoCard
              ref={videoCardRef}
              post={previewPost}
              isVisible={true}
              shouldCache={true}
              shouldDisablePlayback={false}
              onVideoStatus={handleVideoStatus}
              height={videoCardHeight}
              isPlaying={initialIsPlaying}
              showOverlay={true}
              isModal={true}
            />
          ) : (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>No video available</Text>
            </View>
          )}
          
          {/* Simple loading indicator */}
          {!isVideoReady && !videoError && videoUri && (
            <View style={styles.loadingOverlay}>
              <Loading3FillIcon size={48} color={Colors.white} />
            </View>
          )}
          
          {/* Simple error display */}
          {videoError && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{videoError}</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  backButton: {
    position: 'absolute',
    left: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingOverlay: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorText: {
    color: Colors.white,
    fontSize: 16,
    textAlign: 'center',
  },
  statusBarGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
  },
});

export default VideoPreviewModal;