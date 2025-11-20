import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { BORDER_RADIUS } from '../../src/utils/constants';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  Dimensions,
  ScrollView,
  KeyboardAvoidingView,
  TextInput,
  Modal,
  FlatList,
  StatusBar,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Video, { VideoRef } from 'react-native-video';
import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import VideoPreviewModal from '../../src/components/features/video/Preview/VideoPreviewModal';
import { Avatar } from '../../src/components/ui/UI';
import { VerificationBadge } from '../../src/components/features/badging';
import Icon, { BackArrowIcon, DownloadIcon, ChevronDownIcon, ChevronUpIcon, Loading3FillIcon } from '../../src/components/ui/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TextOverlay } from '../../src/types';

import { Colors } from '../../src/components/ui/UI';
import { VideoInfoDisplay } from '../../src/components/ui';
import AuthorItem from '../../src/components/ui/AuthorItem';
import { isTablet } from '../../src/utils/helpers';
import { useCurrentUser, useAccountManagement } from '../../src/stores/userStore';
import { useProfile, useProfileColors } from '../../src/services/cache/ProfileCache';
import ProfileCache from '../../src/services/cache/ProfileCache';
import AtprotoService from '../../src/services/api/AtprotoService';
import VideoProcessingService from '../../src/services/VideoProcessingService';
import { SavedAccount } from '../../src/stores/userStore';
import { getPostableChannels, shouldShowChannelSlash, OrbytChannel } from '../../src/utils/orbytChannels';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ASPECT_RATIO = 9 / 16; // 9:16 aspect ratio for video cards
const VIDEO_WIDTH = SCREEN_WIDTH * 0.4; // Keep the same relative width as before

// Content warning options
const CONTENT_WARNINGS = [
  { id: 'nsfw', label: 'Adult Content (NSFW)' },
  { id: 'nudity', label: 'Nudity' },
  { id: 'violence', label: 'Violence' },
  { id: 'sensitive', label: 'Sensitive Content' },
];

// Comment filtering options
const COMMENT_FILTERS = [
  { id: 'all', label: 'Allow all comments' },
  { id: 'followers', label: 'Only followers can comment' },
  { id: 'mentioned', label: 'Only mentioned users can comment' },
  { id: 'none', label: 'No one can comment' },
];

const VideoPostScreen: React.FC = () => {
  const params = useLocalSearchParams();
  
  // Handle video parameter - it can come as videoPath or video object
  const videoPath = params.videoPath as string;
  const videoObjectString = params.video as string;
  
  // Parse video object if it's a string, otherwise use videoPath
  let videoObject = null;
  try {
    videoObject = videoObjectString ? JSON.parse(videoObjectString) : null;
  } catch (e) {
    console.warn('Failed to parse video object:', e);
  }
  
  // Create video object with proper structure
  const video = videoObject || {
    path: videoPath || '',
    width: 360,
    height: 640,
    duration: 0
  };
  
  const textOverlays = (params.textOverlays as any) || [];
  const navigation = useRouter();
  const [description, setDescription] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const videoRef = useRef<any>(null);

  // Content warning state
  const [selectedContentWarnings, setSelectedContentWarnings] = useState<string[]>([]);
  const [otherWarning, setOtherWarning] = useState('');
  const [showContentWarningInput, setShowContentWarningInput] = useState(false);
  
  // Comment filtering state
  const [commentFilter, setCommentFilter] = useState('all');

  // Channel selection state
  const [selectedChannel, setSelectedChannel] = useState<OrbytChannel | null>(null);
  const [channelSelectionCollapsed, setChannelSelectionCollapsed] = useState(true);

  const [contentWarningsCollapsed, setContentWarningsCollapsed] = useState(true);
  const [commentSettingsCollapsed, setCommentSettingsCollapsed] = useState(true);
  
  // Preview modal state
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [videoLoading, setVideoLoading] = useState(true);
  const [videoError, setVideoError] = useState<string | null>(null);
  // Store video dimensions for aspect ratio
  const [videoDimensions, setVideoDimensions] = useState({ width: video.width || 360, height: video.height || 640 });
  const [videoVolume, setVideoVolume] = useState(1);

  // Video size and compression state
  const [videoSizeInfo, setVideoSizeInfo] = useState<{
    isValid: boolean;
    sizeMB: number;
    maxSizeMB: number;
    needsCompression: boolean;
  } | null>(null);

  // Enhanced video information state
  const [videoInfo, setVideoInfo] = useState<{
    originalInfo: any;
    compressionOptions: Array<{
      level: string;
      label: string;
      estimatedSize: string;
      quality: string;
      uploadTime: string;
    }>;
    recommendedLevel: string;
  } | null>(null);

  // Compression state
  const [compressionStats, setCompressionStats] = useState<{
    originalSize: string;
    compressedSize: string;
    compressionRatio: number;
    sizeReduction: string;
  } | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressedVideoPath, setCompressedVideoPath] = useState<string | null>(null);

  // User store hooks
  const { currentUser } = useCurrentUser();

  // User profile state - using userStore
  const userHandle = currentUser?.handle || null;

  // Use ProfileCache hooks for user profile data (using DID)
  const {
    data: userProfile,
    isLoading: isProfileLoading,
    isError: isProfileError,
  } = useProfile(currentUser?.handle || null);

  const { colors: profileColors } = useProfileColors(currentUser?.handle || null);

  // Ensure profile data is immediately available from cache to prevent flashing
  const profileData = userProfile || (currentUser?.handle ? ProfileCache.getProfileFromCacheSync(currentUser.handle) : null);


  useEffect(() => {
    // Set current user handle in ProfileCache when userStore changes
    if (currentUser?.handle) {
      ProfileCache.setCurrentUserHandle(currentUser.handle);
    }
  }, [currentUser?.did]);

  // Check video size on component mount
  useEffect(() => {
    const checkVideoSize = async () => {
      if (video?.path) {
        try {
          const sizeInfo = await VideoProcessingService.checkVideoSize(video.path);
          setVideoSizeInfo(sizeInfo);
          
          // Get comprehensive video information using video metadata from route params
          const compressionInfo = await VideoProcessingService.getCompressionInfo(video.path, {
            duration: video.duration,
            width: video.width,
            height: video.height,
          });
          setVideoInfo(compressionInfo);
        } catch (error) {
          console.error('Error checking video size:', error);
        }
      }
    };

    checkVideoSize();
  }, [video?.path]);

  // Compress video if needed
  const compressVideo = async () => {
    if (!video?.path || isCompressing) return;
    
    setIsCompressing(true);
    try {
      // Compress the video
      const compressedVideo = await VideoProcessingService.compressVideoWithSizeLimit(video.path);
      setCompressedVideoPath(compressedVideo.path);
      
      // Get compression statistics
      const stats = await VideoProcessingService.getCompressionStats(video.path, compressedVideo.path);
      setCompressionStats(stats);
      
      // Update video size info
      const newSizeInfo = await VideoProcessingService.checkVideoSize(compressedVideo.path);
      setVideoSizeInfo(newSizeInfo);
      
    } catch (error) {
        Alert.alert('compression error', 'failed to compress video. please try again.');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleVideoLoad = (status: any) => {
    if (status.isLoaded) {
      setDuration(status.durationMillis || 0);
    }
  };

  const handleVideoProgress = (status: any) => {
    if (status.isLoaded) {
      setCurrentTime(status.positionMillis || 0);
      setProgress((status.positionMillis || 0) / (status.durationMillis || 1));
    }
  };


  const formatTime = (milliseconds: number) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };



  const toggleContentWarning = (id: string) => {
    if (selectedContentWarnings.includes(id)) {
      setSelectedContentWarnings(selectedContentWarnings.filter(item => item !== id));
    } else {
      setSelectedContentWarnings([...selectedContentWarnings, id]);
    }
  };

  const handlePost = async () => {
    if (isPosting) return;
    
    if (!video?.path) {
      Alert.alert('error', 'no video selected');
      return;
    }

    // Validate video file exists
    try {
      const fileInfo = await FileSystem.getInfoAsync(video.path.replace('file://', ''));
      if (!fileInfo.exists) {
        Alert.alert('error', 'video file not found. please try again.');
        return;
      }
    } catch (error) {
      Alert.alert('error', 'unable to access video file. please try again.');
      return;
    }

    // Description is optional for video posts

    try {
      setIsPosting(true);
      setUploadProgress(0);
      
      // Collect all content warnings, including custom one if present
      const allContentWarnings = [...selectedContentWarnings];
      if (otherWarning.trim()) {
        allContentWarnings.push('other:' + otherWarning.trim());
      }
      
      // Simulate upload progress with realistic stages
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          // Slower progress for video processing
          return prev + 5;
        });
      }, 300);
      
      // Use compressed video if available, otherwise use original
      const videoPathToUpload = compressedVideoPath || video.path;
      
      // Create the video post using AtprotoService
      const result = await AtprotoService.createVideoPost(
        description,
        videoPathToUpload,
        allContentWarnings.length > 0 ? allContentWarnings : undefined,
        commentFilter as 'all' | 'followers' | 'mentioned' | 'none',
        selectedChannel?.slug // Pass channel slug for tagging
      );
      
      // Complete the progress
      setUploadProgress(100);
      
      // Small delay to show completion
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Close the current screen and navigate back to main
      navigation.replace('/(tabs)');
      
    } catch (error: any) {
      let errorMessage = error.message || 'Failed to post video. Please try again.';
      
      // Add additional context for common errors
      if (error.message?.includes('Video upload failed')) {
        errorMessage = 'Video upload failed. This might be due to:\n• Video file size too large (max 50MB)\n• Network connection issues\n• Bluesky service temporarily unavailable\n\nPlease try again with a shorter video or the app will automatically compress it.';
      } else if (error.message?.includes('timeout')) {
        errorMessage = 'Video processing timed out. Please try again with a shorter video.';
      } else if (error.message?.includes('unauthorized')) {
        errorMessage = 'Authentication failed. Please log out and log back in.';
      } else if (error.message?.includes('Video compression failed')) {
        errorMessage = 'Video compression failed. Please try again with a shorter video or check your device storage.';
      }
      
      Alert.alert(
        'error', 
        errorMessage.toLowerCase(),
        [{ text: 'OK' }]
      );
    } finally {
      setIsPosting(false);
      setUploadProgress(0);
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'discard changes?',
      'are you sure you want to discard this post?',
      [
        { text: 'cancel', style: 'cancel' },
        { text: 'discard', style: 'destructive', onPress: () => navigation.back() }
      ]
    );
  };

  const handleDownloadToCameraRoll = async () => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('permission required', 'please grant camera roll permissions to download the video');
        return;
      }
      const asset = await MediaLibrary.createAssetAsync(video.path);
      if (asset) {
        Alert.alert('success', 'video successfully downloaded to camera roll.');
      }
    } catch (error) {
      console.error('Download error:', error);
      Alert.alert('error', 'failed to download video. please try again.');
    }
  };

  // Fade audio utility
  const fadeVolume = (from: number, to: number, duration: number = 300) => {
    const steps = 10;
    const stepTime = duration / steps;
    let current = from;
    const step = (to - from) / steps;
    let count = 0;
    const interval = setInterval(() => {
      current += step;
      setVideoVolume(Math.max(0, Math.min(1, current)));
      count++;
      if (count >= steps) {
        setVideoVolume(to);
        clearInterval(interval);
      }
    }, stepTime);
  };

  // Snapshot current play state to avoid dependency loop
  const isPlayingSnapshotRef = useRef(false);
  useEffect(() => {
    isPlayingSnapshotRef.current = isPlaying;
  }, [isPlaying]);

  // Pause on blur and resume on focus only if it was playing before blur
  const wasPlayingBeforeBlurRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (wasPlayingBeforeBlurRef.current) {
        setIsPlaying(true);
        wasPlayingBeforeBlurRef.current = false;
      }
      return () => {
        wasPlayingBeforeBlurRef.current = isPlayingSnapshotRef.current;
        setIsPlaying(false);
      };
    }, [])
  );

  // Handler to sync time when opening full screen modal
  const handleEditVideo = () => {
    // Fade out audio before opening modal
    fadeVolume(videoVolume, 0, 200);
    setTimeout(() => setShowPreviewModal(true), 200);
  };

  // Handler to sync time when closing full screen modal
  const handleClosePreviewModal = (modalCurrentTime?: number, modalIsPlaying?: boolean) => {
    setShowPreviewModal(false);
    // Fade in audio after closing modal
    fadeVolume(videoVolume, 1, 200);
    if (typeof modalCurrentTime === 'number') {
      setCurrentTime(modalCurrentTime);
      if (videoRef.current && videoRef.current.seek) {
        videoRef.current.seek(modalCurrentTime);
      }
    }
    if (typeof modalIsPlaying === 'boolean') {
      setIsPlaying(modalIsPlaying);
    }
  };

  // Ensure file:// prefix for local files and validate path
  const videoUri = video.path && video.path.trim() ? (video.path.startsWith('file://') ? video.path : `file://${video.path}`) : '';
  
  // Debug logging and file validation
  useEffect(() => {
    console.log('VideoPostScreen Debug:', {
      videoPath: videoPath,
      videoObjectString: videoObjectString,
      parsedVideoObject: videoObject,
      finalVideo: video,
      videoUri: videoUri
    });
    
    // Validate video file exists if we have a local path
    const validateVideoFile = async () => {
      if (videoUri && videoUri.startsWith('file://')) {
        try {
          const filePath = videoUri.replace('file://', '');
          const fileInfo = await FileSystem.getInfoAsync(filePath);
          console.log('Video file validation:', {
            path: filePath,
            exists: fileInfo.exists,
            size: fileInfo.exists ? (fileInfo as any).size : 0,
            isDirectory: fileInfo.isDirectory
          });
          
          if (!fileInfo.exists) {
            setVideoError('Video file not found');
          }
        } catch (error) {
          console.error('Error validating video file:', error);
          setVideoError('Unable to access video file');
        }
      }
    };
    
    validateVideoFile();
  }, [videoPath, videoObjectString, videoObject, video, videoUri]);

  // Calculate container size based on 9:16 aspect ratio
  const containerWidth = VIDEO_WIDTH;
  const containerHeight = containerWidth / ASPECT_RATIO;

  // Add orientation state
  const getOrientation = () => {
    const { width, height } = Dimensions.get('window');
    return width > height ? 'landscape' : 'portrait';
  };

  const [orientation, setOrientation] = useState(getOrientation());
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const onChange = ({ window }: { window: { width: number; height: number } }) => {
      const { width, height } = window;
      setOrientation(width > height ? 'landscape' : 'portrait');
    };
    const sub = Dimensions.addEventListener('change', onChange);
    return () => sub?.remove();
  }, []);

  // Layout for landscape mode
  if (orientation === 'landscape' && isTablet()) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.black} />
        <LinearGradient
          colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.1)', 'transparent']}
          locations={[0, 0.7, 1]}
          style={[styles.statusBarGradient, { height: insets.top + 60 }]}
          pointerEvents="none"
        />
        <View style={styles.landscapeContainer}>
          {/* Left: Info Side */}
          <View style={styles.landscapeInfoSide}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.landscapeInfoScroll, { paddingBottom: 0 }]}>
              <View style={styles.header}>
                <TouchableOpacity onPress={handleCancel} style={styles.headerButton}>
                  <BackArrowIcon size={32} color={Colors.white} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleDownloadToCameraRoll} style={styles.headerButton}>
                  <DownloadIcon size={32} color={Colors.white} />
                </TouchableOpacity>
              </View>
                        {/* Description Section */}
          <View style={styles.descriptionSection}>
            <TextInput
              style={styles.descriptionInput}
              placeholder="add a description for your video..."
                  placeholderTextColor={Colors.lightGray}
                  multiline
                  maxLength={300}
                  value={description}
                  onChangeText={setDescription}
                />
                <Text style={styles.charCount}>
                  {description.length}/300
                </Text>
              </View>
              {/* Content Warnings */}
              <View style={styles.section}>
                <TouchableOpacity 
                  style={styles.sectionHeader}
                  onPress={() => setContentWarningsCollapsed(!contentWarningsCollapsed)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.sectionTitle}>content warnings</Text>
                  {contentWarningsCollapsed ? (
                    <ChevronDownIcon size={24} color={Colors.white} />
                  ) : (
                    <ChevronUpIcon size={24} color={Colors.white} />
                  )}
                </TouchableOpacity>
                {!contentWarningsCollapsed && (
                  <>
                    <Text style={styles.sectionSubtitle}>
                      add appropriate warnings if your video contains sensitive content.
                    </Text>
                    {CONTENT_WARNINGS.map(warning => (
                      <TouchableOpacity 
                        key={warning.id} 
                        style={styles.optionRow}
                        onPress={() => toggleContentWarning(warning.id)}
                      >
                        <Text style={styles.optionText}>{warning.label.toLowerCase()}</Text>
                        <View style={[
                          styles.checkbox,
                          selectedContentWarnings.includes(warning.id) && styles.checkboxSelected
                        ]}>
                          {selectedContentWarnings.includes(warning.id) && (
                            <Icon name="checkmark" size={16} color={Colors.black} />
                          )}
                        </View>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity 
                      style={styles.optionRow}
                      onPress={() => setShowContentWarningInput(!showContentWarningInput)}
                    >
                      <Text style={styles.optionText}>other warning</Text>
                      <View style={[
                        styles.checkbox,
                        showContentWarningInput && styles.checkboxSelected
                      ]}>
                        {showContentWarningInput && (
                          <Icon name="checkmark" size={16} color={Colors.black} />
                        )}
                      </View>
                    </TouchableOpacity>
                    {showContentWarningInput && (
                      <TextInput
                        style={styles.otherWarningInput}
                        placeholder="specify content warning"
                        placeholderTextColor={Colors.lightGray}
                        value={otherWarning}
                        onChangeText={setOtherWarning}
                      />
                    )}
                  </>
                )}
              </View>
              {/* Comment Filtering */}
              <View style={styles.section}>
                <TouchableOpacity 
                  style={styles.sectionHeader}
                  onPress={() => setCommentSettingsCollapsed(!commentSettingsCollapsed)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.sectionTitle}>comment settings</Text>
                  {commentSettingsCollapsed ? (
                    <ChevronDownIcon size={24} color={Colors.white} />
                  ) : (
                    <ChevronUpIcon size={24} color={Colors.white} />
                  )}
                </TouchableOpacity>
                {!commentSettingsCollapsed && (
                  <>
                    <Text style={styles.sectionSubtitle}>
                      control who can comment on your video.
                    </Text>
                    {COMMENT_FILTERS.map(filter => (
                      <TouchableOpacity 
                        key={filter.id} 
                        style={styles.optionRow}
                        onPress={() => setCommentFilter(filter.id)}
                      >
                        <Text style={styles.optionText}>{filter.label.toLowerCase()}</Text>
                        <View style={[
                          styles.commentCheckbox,
                          commentFilter === filter.id && styles.checkboxSelected
                        ]}>
                          {commentFilter === filter.id && (
                            <Icon name="checkmark" size={16} color={Colors.black} />
                          )}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </>
                )}
              </View>
              {/* Channel Selection */}
              <View style={styles.section}>
                <TouchableOpacity 
                  style={styles.sectionHeader}
                  onPress={() => setChannelSelectionCollapsed(!channelSelectionCollapsed)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.sectionTitle}>channel</Text>
                  {channelSelectionCollapsed ? (
                    <ChevronDownIcon size={24} color={Colors.white} />
                  ) : (
                    <ChevronUpIcon size={24} color={Colors.white} />
                  )}
                </TouchableOpacity>
                {!channelSelectionCollapsed && (
                  <>
                    <Text style={styles.sectionSubtitle}>
                      post to a specific channel (optional).
                    </Text>
                    {/* None option */}
                    <TouchableOpacity 
                      style={styles.optionRow}
                      onPress={() => setSelectedChannel(null)}
                    >
                      <Text style={styles.optionText}>none</Text>
                      <View style={[
                        styles.commentCheckbox,
                        selectedChannel === null && styles.checkboxSelected
                      ]}>
                        {selectedChannel === null && (
                          <Icon name="checkmark" size={16} color={Colors.black} />
                        )}
                      </View>
                    </TouchableOpacity>
                    {/* Channel options */}
                    {getPostableChannels().map(channel => (
                      <TouchableOpacity 
                        key={channel.slug} 
                        style={styles.optionRow}
                        onPress={() => setSelectedChannel(channel)}
                      >
                        <View style={styles.channelInfo}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            {shouldShowChannelSlash(channel.uri) && (
                              <Text style={[styles.optionText, styles.orbytSlash, { color: channel.channelColor || '#FFD700' }]}>/</Text>
                            )}
                            <Text style={styles.optionText}>{channel.displayName.toLowerCase()}</Text>
                          </View>
                        </View>
                        <View style={[
                          styles.commentCheckbox,
                          selectedChannel?.slug === channel.slug && styles.checkboxSelected
                        ]}>
                          {selectedChannel?.slug === channel.slug && (
                            <Icon name="checkmark" size={16} color={Colors.black} />
                          )}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </>
                )}
              </View>
              {/* Video Info */}
              {videoInfo && (
                <VideoInfoDisplay
                  videoInfo={videoInfo.originalInfo}
                />
              )}
              {/* Post Button */}
              <View style={[styles.landscapePostButtonContainer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                {Platform.OS === 'ios' && isLiquidGlassAvailable() ? (
                  <TouchableOpacity 
                    style={styles.landscapePostButtonGlass}
                    onPress={handlePost}
                    disabled={isPosting}
                    activeOpacity={0.8}
                  >
                    <GlassView
                      style={StyleSheet.absoluteFill}
                      glassEffectStyle="clear"
                      tintColor="rgba(255,255,255,0.9)"
                      isInteractive
                    />
                    <View style={styles.buttonContent}>
                      {isPosting ? (
                        <View style={styles.loadingContainer}>
                          <Loading3FillIcon size={24} color={Colors.black} />
                          <Text style={styles.postButtonText}>
                            {uploadProgress < 50 ? `Uploading video... ${uploadProgress}%` : 
                             uploadProgress < 90 ? `Processing video... ${uploadProgress}%` : 
                             'Creating post...'}
                          </Text>
                        </View>
                      ) : (
                        <Text style={styles.postButtonText}>Post</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity 
                    style={styles.landscapePostButtonHost}
                    onPress={handlePost}
                    disabled={isPosting}
                    activeOpacity={0.8}
                  >
                    <View style={styles.buttonContent}>
                      {isPosting ? (
                        <View style={styles.loadingContainer}>
                          <Loading3FillIcon size={24} color={Colors.black} />
                          <Text style={styles.postButtonText}>
                            {uploadProgress < 50 ? `Uploading video... ${uploadProgress}%` : 
                             uploadProgress < 90 ? `Processing video... ${uploadProgress}%` : 
                             'Creating post...'}
                          </Text>
                        </View>
                      ) : (
                        <Text style={styles.postButtonText}>Post</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          </View>
          {/* Right: Video Preview Side */}
          <View style={styles.landscapeVideoSide}>
            <View style={styles.previewSection}>
              <TouchableOpacity onPress={handleEditVideo} activeOpacity={0.8} style={[styles.videoContainer, { width: '100%', aspectRatio: ASPECT_RATIO, maxHeight: '90%' }]}> 
                {videoLoading && (
                  <View style={[styles.video, { justifyContent: 'center', alignItems: 'center', position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 2, backgroundColor: Colors.darkGray }]}> 
                    <Loading3FillIcon size={48} color={Colors.white} />
                  </View>
                )}
                <View style={{ width: '100%', aspectRatio: ASPECT_RATIO, justifyContent: 'center', alignItems: 'center', position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>
                  {videoUri ? (
                      <Video
                        ref={videoRef}
                        source={{ uri: videoUri }}
                        style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}
                        resizeMode="contain"
                        paused={!isPlaying}
                        repeat={true}
                        muted={true}
                        volume={videoVolume}
                      onLoadStart={() => {
                        setVideoLoading(true);
                        setVideoError(null);
                      }}
                      onLoad={e => {
                        setVideoLoading(false);
                        if (e?.naturalSize?.width && e?.naturalSize?.height) {
                          setVideoDimensions({ width: e.naturalSize.width, height: e.naturalSize.height });
                        }
                        if (currentTime > 0 && videoRef.current && videoRef.current.seek) {
                          videoRef.current.seek(currentTime);
                        }
                      }}
                      onProgress={status => {
                        if (status?.currentTime !== undefined) {
                          setCurrentTime(status.currentTime);
                        }
                      }}
                      onError={e => {
                        setVideoLoading(false);
                        setVideoError('Failed to load video');
                      }}
                    />
                  ) : (
                    <View style={{ justifyContent: 'center', alignItems: 'center', flex: 1 }}>
                      <Text style={{ color: Colors.white, fontSize: 16, textAlign: 'center' }}>
                        No video source available
                      </Text>
                    </View>
                  )}
                </View>
                {videoError && (
                  <View style={[styles.video, { justifyContent: 'center', alignItems: 'center', position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 3, backgroundColor: Colors.darkGray }]}> 
                    <Text style={{ color: Colors.white, fontSize: 16 }}>{videoError && videoError.toLowerCase()}</Text>
                  </View>
                )}
                {!videoLoading && !videoError && textOverlays && textOverlays.length > 0 && textOverlays.map((overlay: TextOverlay) => (
                  <View
                    key={overlay.id}
                    style={[
                      styles.textOverlayContainer,
                      {
                        left: overlay.position.x,
                        top: overlay.position.y,
                        transform: [{ scale: overlay.scale }]
                      }
                    ]}
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
              </TouchableOpacity>
            </View>
          </View>
        </View>
        {/* Video Preview Modal (unchanged) */}
        <VideoPreviewModal
          visible={showPreviewModal}
          onClose={handleClosePreviewModal}
          videoPath={video.path || ''}
          description={description}
          userProfile={profileData}
          initialTime={currentTime}
          initialIsPlaying={isPlaying}
        />
      </SafeAreaView>
    );
  }

  // ... existing portrait layout ...

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.black} />
      <LinearGradient
        colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.1)', 'transparent']}
        locations={[0, 0.7, 1]}
        style={[styles.statusBarGradient, { height: insets.top + 60 }]}
        pointerEvents="none"
      />
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollViewContentContainer}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleCancel} style={styles.headerButton}>
              <BackArrowIcon size={32} color={Colors.white} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDownloadToCameraRoll} style={styles.headerButton}>
              <DownloadIcon size={32} color={Colors.white} />
            </TouchableOpacity>
          </View>
          {/* Video Preview Section */}
          <View style={styles.previewSection}>
            <TouchableOpacity onPress={handleEditVideo} activeOpacity={0.8} style={[styles.videoContainer, { width: containerWidth, height: containerHeight }]}>
              {/* Show loading indicator while video is loading */}
              {videoLoading && (
                <View style={[styles.video, { justifyContent: 'center', alignItems: 'center', position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 2, backgroundColor: Colors.darkGray }]}> 
                  <Loading3FillIcon size={48} color={Colors.white} />
                </View>
              )}
              <View style={{ width: containerWidth, height: containerHeight, justifyContent: 'center', alignItems: 'center', position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>
                {videoUri ? (
                  <Video
                    ref={videoRef}
                    source={{ uri: videoUri }}
                    style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}
                    resizeMode="cover"
                    paused={!isPlaying}
                    repeat={true}
                    muted={true}
                    volume={videoVolume}
                    onLoadStart={() => {
                      setVideoLoading(true);
                      setVideoError(null);
                    }}
                    onLoad={e => {
                      setVideoLoading(false);
                      if (e?.naturalSize?.width && e?.naturalSize?.height) {
                        setVideoDimensions({ width: e.naturalSize.width, height: e.naturalSize.height });
                      }
                      // Seek to currentTime if not at start
                      if (currentTime > 0 && videoRef.current && videoRef.current.seek) {
                        videoRef.current.seek(currentTime);
                      }
                    }}
                    onProgress={status => {
                      if (status?.currentTime !== undefined) {
                        setCurrentTime(status.currentTime);
                      }
                    }}
                    onError={e => {
                      setVideoLoading(false);
                      setVideoError('Failed to load video');
                    }}
                  />
                ) : (
                  <View style={{ justifyContent: 'center', alignItems: 'center', flex: 1 }}>
                    <Text style={{ color: Colors.white, fontSize: 16, textAlign: 'center' }}>
                      No video source available
                    </Text>
                  </View>
                )}
              </View>
              {/* Error message if video fails to load */}
              {videoError && (
                <View style={[styles.video, { justifyContent: 'center', alignItems: 'center', position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 3, backgroundColor: Colors.darkGray }]}> 
                  <Text style={{ color: Colors.white, fontSize: 16 }}>{videoError}</Text>
                </View>
              )}
              {/* Text Overlays - only show if they exist */}
              {!videoLoading && !videoError && textOverlays && textOverlays.length > 0 && textOverlays.map((overlay: TextOverlay) => (
                <View
                  key={overlay.id}
                  style={[
                    styles.textOverlayContainer,
                    {
                      left: overlay.position.x,
                      top: overlay.position.y,
                      transform: [{ scale: overlay.scale }]
                    }
                  ]}
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
            </TouchableOpacity>
          </View>
          
          {/* Description Section */}
          <View style={styles.descriptionSection}>
            <TextInput
              style={styles.descriptionInput}
              placeholder="write a caption..."
              placeholderTextColor={Colors.gray}
              multiline
              maxLength={300}
              value={description}
              onChangeText={setDescription}
            />
            
                 <Text style={styles.charCount}>
                   {description.length}/300
                 </Text>
          </View>
          
          {/* Content Warning Section */}
          <View style={styles.section}>
            <TouchableOpacity 
              style={styles.sectionHeader}
              onPress={() => setContentWarningsCollapsed(!contentWarningsCollapsed)}
              activeOpacity={0.7}
            >
                  <Text style={styles.sectionTitle}>content warnings</Text>
              {contentWarningsCollapsed ? (
                <ChevronDownIcon size={24} color={Colors.white} />
              ) : (
                <ChevronUpIcon size={24} color={Colors.white} />
              )}
            </TouchableOpacity>
            {!contentWarningsCollapsed && (
              <>
                    <Text style={styles.sectionSubtitle}>
                      add appropriate warnings if your video contains sensitive content.
                </Text>
                {CONTENT_WARNINGS.map(warning => (
                  <TouchableOpacity 
                    key={warning.id} 
                    style={styles.optionRow}
                    onPress={() => toggleContentWarning(warning.id)}
                  >
                         <Text style={styles.optionText}>{warning.label.toLowerCase()}</Text>
                    <View style={[
                      styles.checkbox,
                      selectedContentWarnings.includes(warning.id) && styles.checkboxSelected
                    ]}>
                      {selectedContentWarnings.includes(warning.id) && (
                        <Icon name="checkmark" size={16} color={Colors.black} />
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity 
                  style={styles.optionRow}
                  onPress={() => setShowContentWarningInput(!showContentWarningInput)}
                >
                       <Text style={styles.optionText}>other warning</Text>
                  <View style={[
                    styles.checkbox,
                    showContentWarningInput && styles.checkboxSelected
                  ]}>
                    {showContentWarningInput && (
                      <Icon name="checkmark" size={16} color={Colors.black} />
                    )}
                  </View>
                </TouchableOpacity>
                {showContentWarningInput && (
                  <TextInput
                    style={styles.otherWarningInput}
                    placeholder="Specify content warning"
                    placeholderTextColor={Colors.gray}
                    value={otherWarning}
                    onChangeText={setOtherWarning}
                  />
                )}
              </>
            )}
          </View>
          
          {/* Comment Filtering Section */}
          <View style={styles.section}>
            <TouchableOpacity 
              style={styles.sectionHeader}
              onPress={() => setCommentSettingsCollapsed(!commentSettingsCollapsed)}
              activeOpacity={0.7}
            >
                 <Text style={styles.sectionTitle}>comment settings</Text>
              {commentSettingsCollapsed ? (
                <ChevronDownIcon size={24} color={Colors.white} />
              ) : (
                <ChevronUpIcon size={24} color={Colors.white} />
              )}
            </TouchableOpacity>
            {!commentSettingsCollapsed && (
              <>
                    <Text style={styles.sectionSubtitle}>
                      control who can comment on your video.
                </Text>
                                {COMMENT_FILTERS.map(filter => (
                  <TouchableOpacity 
                    key={filter.id} 
                    style={styles.optionRow}
                    onPress={() => setCommentFilter(filter.id)}
                  >
                       <Text style={styles.optionText}>{filter.label.toLowerCase()}</Text>
                    <View style={[
                      styles.commentCheckbox,
                      commentFilter === filter.id && styles.checkboxSelected
                    ]}>
                      {commentFilter === filter.id && (
                        <Icon name="checkmark" size={16} color={Colors.black} />
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </View>
          {/* Channel Selection */}
          <View style={styles.section}>
            <TouchableOpacity 
              style={styles.sectionHeader}
              onPress={() => setChannelSelectionCollapsed(!channelSelectionCollapsed)}
              activeOpacity={0.7}
            >
              <Text style={styles.sectionTitle}>channel</Text>
              {channelSelectionCollapsed ? (
                <ChevronDownIcon size={24} color={Colors.white} />
              ) : (
                <ChevronUpIcon size={24} color={Colors.white} />
              )}
            </TouchableOpacity>
            {!channelSelectionCollapsed && (
              <>
                <Text style={styles.sectionSubtitle}>
                  post to a specific channel (optional).
                </Text>
                {/* None option */}
                <TouchableOpacity 
                  style={styles.optionRow}
                  onPress={() => setSelectedChannel(null)}
                >
                  <Text style={styles.optionText}>none</Text>
                  <View style={[
                    styles.commentCheckbox,
                    selectedChannel === null && styles.checkboxSelected
                  ]}>
                    {selectedChannel === null && (
                      <Icon name="checkmark" size={16} color={Colors.black} />
                    )}
                  </View>
                </TouchableOpacity>
                {/* Channel options */}
                {getPostableChannels().map(channel => (
                  <TouchableOpacity 
                    key={channel.slug} 
                    style={styles.optionRow}
                    onPress={() => setSelectedChannel(channel)}
                  >
                    <View style={styles.channelInfo}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {shouldShowChannelSlash(channel.uri) && (
                          <Text style={[styles.optionText, styles.orbytSlash, { color: channel.channelColor || '#FFD700' }]}>/</Text>
                        )}
                        <Text style={styles.optionText}>{channel.displayName.toLowerCase()}</Text>
                      </View>
                    </View>
                    <View style={[
                      styles.commentCheckbox,
                      selectedChannel?.slug === channel.slug && styles.checkboxSelected
                    ]}>
                      {selectedChannel?.slug === channel.slug && (
                        <Icon name="checkmark" size={16} color={Colors.black} />
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </View>
          
          {/* Video Information Display */}
          {videoInfo && (
            <View style={[styles.videoInfoContainer, { paddingBottom: 80 + Math.max(insets.bottom, 20) }]}>
              <VideoInfoDisplay
                videoInfo={videoInfo.originalInfo}
              />
            </View>
          )}
          
        </ScrollView>
        

        
        <View style={[styles.floatingPostButtonContainer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          {Platform.OS === 'ios' && isLiquidGlassAvailable() ? (
            <TouchableOpacity 
              style={styles.floatingPostButtonGlass}
              onPress={handlePost}
              disabled={isPosting}
              activeOpacity={0.8}
            >
              <GlassView
                style={StyleSheet.absoluteFill}
                glassEffectStyle="clear"
                tintColor="rgba(255,255,255,0.9)"
                isInteractive
              />
              <View style={styles.buttonContent}>
                {isPosting ? (
                  <View style={styles.loadingContainer}>
                    <Loading3FillIcon size={24} color={Colors.black} />
                    <Text style={styles.postButtonText}>
                      {uploadProgress < 50 ? `Uploading video... ${uploadProgress}%` : 
                       uploadProgress < 90 ? `Processing video... ${uploadProgress}%` : 
                       'Creating post...'}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.postButtonText}>Post</Text>
                )}
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={styles.floatingPostButtonHost}
              onPress={handlePost}
              disabled={isPosting}
              activeOpacity={0.8}
            >
              <View style={styles.buttonContent}>
                {isPosting ? (
                  <View style={styles.loadingContainer}>
                    <Loading3FillIcon size={24} color={Colors.black} />
                    <Text style={styles.postButtonText}>
                      {uploadProgress < 50 ? `Uploading video... ${uploadProgress}%` : 
                       uploadProgress < 90 ? `Processing video... ${uploadProgress}%` : 
                       'Creating post...'}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.postButtonText}>Post</Text>
                )}
              </View>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
      
      {/* Video Preview Modal */}
      <VideoPreviewModal
        visible={showPreviewModal}
        onClose={handleClosePreviewModal}
        videoPath={video.path || ''}
        description={description}
        userProfile={profileData}
        initialTime={currentTime}
        initialIsPlaying={isPlaying}
      />

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
  },
  headerTitle: {
    color: Colors.white,
    fontSize: 18,
    fontFamily: 'Firma-SemiBold',
  },
  headerButton: {
    padding: 8,
    borderRadius: BORDER_RADIUS.LARGE,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.overlayBlack50,
    marginHorizontal: 2,
  },
  postButton: {
    backgroundColor: Colors.darkGray,
    paddingHorizontal: 15,
  },
  scrollView: {
    flex: 1,
  },
  previewSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 0,
  },
  videoContainer: {
    backgroundColor: Colors.darkGray,
    position: 'relative',
    overflow: 'hidden',
    alignSelf: 'center',
    borderRadius: BORDER_RADIUS.MEDIUM,
  },
  video: {
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
    color: Colors.white,
    fontSize: 22,
    fontFamily: 'Firma-Bold',
    textAlign: 'center',
    textShadowColor: Colors.overlayBlack50,
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
    padding: 4,
  },
  playPauseButton: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -25,
    marginTop: -25,
    width: 50,
    height: 50,
    borderRadius: BORDER_RADIUS.MEDIUM,
    backgroundColor: Colors.overlayBlack60,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  editButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.LARGE,
    backgroundColor: Colors.overlayBlack50,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  progressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 15,
    paddingBottom: 15,
    zIndex: 1,
  },
  progressBarBackground: {
    height: 4,
    backgroundColor: Colors.overlayWhite30,
    borderRadius: BORDER_RADIUS.SMALL,
    overflow: 'hidden',
  },
  progressBar: {
    height: 4,
    backgroundColor: Colors.darkGray,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
  },
  timeText: {
    color: Colors.white,
    fontSize: 12,
    fontFamily: 'Firma-Regular',
  },
  descriptionSection: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: Colors.overlayWhite10,
  },
  authorItemStyle: {
    marginBottom: 4,
    marginLeft: 5,
    paddingLeft: 0,
  },

  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: Colors.white,
    fontSize: 14,
    fontFamily: 'Firma-Medium',
  },
  descriptionInput: {
    color: Colors.white,
    fontFamily: 'Firma-Regular',
    fontSize: 16,
    minHeight: 80,
    maxHeight: 150,
    textAlignVertical: 'top',
    paddingBottom: 20,
  },
  charCount: {
    color: Colors.lightGray,
    fontSize: 12,
    fontFamily: 'Firma-Regular',
    textAlign: 'right',
    marginTop: 5,
  },
  section: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: Colors.overlayWhite10,
  },
  sectionTitle: {
    color: Colors.white,
    fontSize: 18,
    fontFamily: 'Firma-SemiBold',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionSubtitle: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    marginBottom: 15,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  optionText: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Firma-Medium',
  },
  orbytSlash: {
    fontFamily: 'Firma-Black',
    marginRight: 0,
  },
  channelInfo: {
    flex: 1,
    marginRight: 10,
  },
  channelDescription: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    marginTop: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: BORDER_RADIUS.SMALL,
    borderWidth: 2,
    borderColor: Colors.lightGray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentCheckbox: {
    width: 22,
    height: 22,
    borderRadius: BORDER_RADIUS.FULL,
    borderWidth: 2,
    borderColor: Colors.lightGray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: Colors.white,
    borderColor: Colors.white,
  },
  radioButton: {
    width: 22,
    height: 22,
    borderRadius: BORDER_RADIUS.MEDIUM,
    borderWidth: 2,
    borderColor: Colors.lightGray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioButtonSelected: {
    borderColor: Colors.lightGray,
  },
  radioButtonInner: {
    width: 12,
    height: 12,
    borderRadius: BORDER_RADIUS.SMALL,
    backgroundColor: Colors.darkGray,
  },
  otherWarningInput: {
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.SMALL,
    padding: 12,
    color: Colors.white,
    marginTop: 5,
    marginBottom: 10,
    fontFamily: 'Firma-Regular',
  },
  floatingPostButton: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: Colors.white,
    height: 60,
    borderRadius: BORDER_RADIUS.LARGE,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.lightGray,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  floatingPostButtonContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
  },
  floatingPostButtonHost: {
    height: 60,
    borderRadius: 30, // Fully rounded (height/2)
    backgroundColor: Colors.white,
    shadowColor: Colors.lightGray,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  floatingPostButtonGlass: {
    height: 60,
    borderRadius: 30, // Fully rounded (height/2)
    shadowColor: Colors.lightGray,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonContent: {
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },
  postButtonText: {
    color: Colors.black,
    fontSize: 18,
    fontFamily: 'Firma-Black',
  },
  floatingPostButtonDisabled: {
    opacity: 1,
  },
  floatingButtonLoadingText: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Firma-SemiBold',
  },

  scrollViewContentContainer: {
    flexGrow: 1,
  },
  videoInfoContainer: {
    // Dynamic paddingBottom applied inline
  },
  radioContainer: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCheckmark: {
    position: 'absolute',
    top: 3,
    left: 3,
  },
  landscapeContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Colors.darkGray,
  },
  landscapeInfoSide: {
    flex: 1,
    padding: 20,
    backgroundColor: Colors.darkGray,
    justifyContent: 'flex-start',
    minWidth: 0,
  },
  landscapeInfoScroll: {
    paddingBottom: 40,
  },
  landscapeVideoSide: {
    flex: 1,
    backgroundColor: Colors.darkGray,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
    padding: 0,
  },
  landscapePostButton: {
    marginTop: 24,
    backgroundColor: Colors.white,
    height: 60,
    borderRadius: BORDER_RADIUS.LARGE,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.lightGray,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  landscapePostButtonContainer: {
    marginTop: 24,
  },
  landscapePostButtonHost: {
    height: 60,
    borderRadius: 30, // Fully rounded (height/2)
    backgroundColor: Colors.white,
    shadowColor: Colors.lightGray,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  landscapePostButtonGlass: {
    height: 60,
    borderRadius: 30, // Fully rounded (height/2)
    shadowColor: Colors.lightGray,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBarGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
  },

});

export default VideoPostScreen;