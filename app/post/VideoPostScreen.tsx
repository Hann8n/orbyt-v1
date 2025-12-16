import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Animated } from 'react-native';
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
  Keyboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useVideoPlayer, VideoView, VideoPlayer } from 'expo-video';
import { useEvent } from 'expo';
import { File, Directory, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Avatar } from '../../src/components/ui/UI';
import { VerificationBadge } from '../../src/components/features/badging';
import Icon, { BackArrowIcon, ChevronDownIcon, Loading3FillIcon, DownSmallFillIcon } from '../../src/components/ui/Icon';
import BlurredThumbnailBackground from '../../src/components/ui/BlurredThumbnailBackground';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TextOverlay } from '../../src/types';
import { resolveVideoPath, debugVideoPath, VideoPathInfo } from '../../src/utils/videoPath';

import { Colors } from '../../src/components/ui/UI';
import AuthorItem from '../../src/components/ui/AuthorItem';
import { isTablet } from '../../src/utils/helpers';
import { useCurrentUser, useAccountManagement } from '../../src/stores/userStore';
import { useProfile, useProfileColors } from '../../src/services/cache/ProfileCache';
import ProfileCache from '../../src/services/cache/ProfileCache';
import AtprotoService from '../../src/services/api/AtprotoService';
import VideoProcessingService from '../../src/services/VideoProcessingService';
import { logger } from '../../src/utils/logger';
import { SavedAccount } from '../../src/stores/userStore';
import { getPostableChannels, shouldShowChannelSlash, OrbytChannel, extractFeedSlug, getChannelAvatarUri } from '../../src/utils/orbytChannels';
import VerticalListSheet, { VerticalListButton } from '../../src/components/ui/VerticalListSheet';
import { useRichTextSearchTrigger, RichTextSearchModal } from '../../src/components/ui/usersearch';
import { parseRichText } from '../../src/utils/richTextParser';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ASPECT_RATIO = 9 / 16; // 9:16 aspect ratio for video cards
const VIDEO_WIDTH = SCREEN_WIDTH * 0.33; // Slightly smaller preview

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
  
  // Video path is already standardized when it arrives from create.tsx or video-processing.tsx
  // OR segments are provided for background merging
  const videoPath = params.videoPath as string;
  const segmentsParam = params.segments as string | undefined;
  const thumbnailPath = params.thumbnailPath as string | undefined;
  
  // Debug: Log thumbnail path
  useEffect(() => {
    if (thumbnailPath) {
      logger.info('VideoPostScreen received thumbnailPath', { component: 'VideoPostScreen', thumbnailPath });
    }
  }, [thumbnailPath]);
  
  const textOverlays = (params.textOverlays as any) || [];
  const navigation = useRouter();
  const [description, setDescription] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const playerRef = useRef<VideoPlayer | null>(null);
  
  // Background merging state
  const [isMerging, setIsMerging] = useState(false);
  const [mergingProgress, setMergingProgress] = useState(0);
  const [mergedVideoPath, setMergedVideoPath] = useState<string | null>(null);
  const [mergingError, setMergingError] = useState<string | null>(null);

  // Content warning state
  const [selectedContentWarnings, setSelectedContentWarnings] = useState<string[]>([]);
  const [otherWarning, setOtherWarning] = useState('');
  const [showContentWarningInput, setShowContentWarningInput] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  
  // Comment filtering state
  const [commentFilter, setCommentFilter] = useState<string | null>(null);

  // Channel selection state
  const [selectedChannel, setSelectedChannel] = useState<OrbytChannel | null>(null);
  
  // Sheet visibility state
  const [showContentWarningsSheet, setShowContentWarningsSheet] = useState(false);
  const [showCommentSettingsSheet, setShowCommentSettingsSheet] = useState(false);
  const [showChannelSelectionSheet, setShowChannelSelectionSheet] = useState(false);
  const [showVideoInfoSheet, setShowVideoInfoSheet] = useState(false);
  
  
  // Full-screen description input modal state
  const [showDescriptionInputModal, setShowDescriptionInputModal] = useState(false);
  const descriptionModalOpacity = useRef(new Animated.Value(0)).current;
  const [videoLoading, setVideoLoading] = useState(true);
  const [videoError, setVideoError] = useState<string | null>(null);
  // Store video dimensions for aspect ratio
  const [videoDimensions, setVideoDimensions] = useState({ 
    width: 360, 
    height: 640 
  });
  const [videoVolume, setVideoVolume] = useState(1);
  
  // Rich text search state (for @ mentions and # hashtags)
  const [descriptionSelection, setDescriptionSelection] = useState({ start: 0, end: 0 });
  const [descriptionInputHeight, setDescriptionInputHeight] = useState(24);

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
  const [compressionProgress, setCompressionProgress] = useState(0);
  const [wasAutoCompressed, setWasAutoCompressed] = useState(false);

  // User store hooks
  const { currentUser } = useCurrentUser();
  
  // Rich text search hook for description input
  const {
    inputProps: richTextInputProps,
    richTextSearchModalProps,
  } = useRichTextSearchTrigger({
    value: description,
    selection: descriptionSelection,
    onChangeText: setDescription,
    onSelectionChange: (e) => {
      setDescriptionSelection(e.nativeEvent.selection);
    },
  });

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

  // Handle background merging if segments are provided
  useEffect(() => {
    if (!segmentsParam || mergedVideoPath) return; // Already merged or no segments
    
    const mergeSegments = async () => {
      try {
        setIsMerging(true);
        setMergingError(null);
        setMergingProgress(0);
        
        // Parse segments from params
        const segments = JSON.parse(segmentsParam);
        
        if (!segments || segments.length === 0) {
          throw new Error('No video segments provided');
        }
        
        // Convert to ProcessingVideoSegment format
        const processingSegments = segments.map((segment: any) => ({
          startTime: segment.startTime,
          duration: segment.duration,
          video: segment.video,
          sourceType: segment.sourceType,
        }));
        
        // Merge segments in background using InteractionManager
        const { InteractionManager } = require('react-native');
        await InteractionManager.runAfterInteractions(async () => {
          setMergingProgress(25);
          
          const mergedVideo = await VideoProcessingService.mergeSegments(processingSegments);
          
          setMergingProgress(100);
          setMergedVideoPath(mergedVideo.path);
          setIsMerging(false);
          
          logger.info('Background merging completed', {
            component: 'VideoPostScreen',
            mergedPath: mergedVideo.path,
          });
        });
      } catch (error: any) {
        logger.error('Background merging failed', error, { component: 'VideoPostScreen' });
        setMergingError(error.message || 'Failed to merge video segments');
        setIsMerging(false);
        Alert.alert(
          'Merging Failed',
          error.message || 'Failed to merge video segments. Please try again.',
          [
            {
              text: 'Go Back',
              onPress: () => navigation.back(),
            }
          ]
        );
      }
    };
    
    mergeSegments();
  }, [segmentsParam, mergedVideoPath, navigation]);

  // Determine the active video path (merged > provided > null)
  const activeVideoPath = mergedVideoPath || videoPath;

  // Automatically check upload limits and compress video if needed on component mount
  // Defer compression until after interactions complete to avoid blocking UI
  useEffect(() => {
    // Use merged video path if available, otherwise use provided videoPath
    if (!activeVideoPath) return;

    const { InteractionManager } = require('react-native');
    const interactionHandle = InteractionManager.runAfterInteractions(async () => {
      try {
        setIsCompressing(true);
        setCompressionProgress(0);
        
        // Automatically check upload limits and compress if needed
        // This uses WhatsApp-like automatic compression in the background
        const result = await VideoProcessingService.checkAndCompressVideoForUpload(
          activeVideoPath,
          undefined, // assetId not available here, path is already standardized
          (progress) => {
            setCompressionProgress(progress);
          }
        );

          // Update state based on compression result
          if (result.wasCompressed) {
            setCompressedVideoPath(result.processedVideo.path);
            setWasAutoCompressed(true);
            
            // Get compression statistics
            const stats = await VideoProcessingService.getCompressionStats(
              activeVideoPath,
              result.processedVideo.path
            );
            setCompressionStats(stats);
            
            // Update video size info
            const newSizeInfo = await VideoProcessingService.checkVideoSize(result.processedVideo.path);
            setVideoSizeInfo(newSizeInfo);
            
            logger.info('Video automatically compressed', {
              component: 'VideoPostScreen',
              originalSize: result.originalSize,
              compressedSize: result.compressedSize,
              reduction: `${((1 - result.compressedSize / result.originalSize) * 100).toFixed(1)}%`,
            });
          } else {
            // Video didn't need compression, just check size info
            const sizeInfo = await VideoProcessingService.checkVideoSize(activeVideoPath);
            setVideoSizeInfo(sizeInfo);
            
            // Get comprehensive video information
            const compressionInfo = await VideoProcessingService.getCompressionInfo(activeVideoPath);
            setVideoInfo(compressionInfo);
          }
        } catch (error) {
          console.error('Error checking and compressing video:', error);
          // Fallback: just check video size without compression
          try {
            const sizeInfo = await VideoProcessingService.checkVideoSize(activeVideoPath);
            setVideoSizeInfo(sizeInfo);
          } catch (fallbackError) {
            console.error('Error in fallback video size check:', fallbackError);
          }
        } finally {
          setIsCompressing(false);
          setCompressionProgress(0);
        }
      });

    return () => {
      interactionHandle.cancel();
    };
  }, [videoPath]);

  // Manual compress video (fallback if automatic compression didn't work)
  const compressVideo = async () => {
    if (!activeVideoPath || isCompressing || isMerging) return;
    
    setIsCompressing(true);
    setCompressionProgress(0);
    try {
      // Use automatic compression (WhatsApp-like) with progress callback
      const compressedVideo = await VideoProcessingService.compressVideoAuto(
        activeVideoPath,
        undefined,
        (progress) => {
          setCompressionProgress(progress);
        }
      );
      setCompressedVideoPath(compressedVideo.path);
      setWasAutoCompressed(true);
      
      // Get compression statistics
      const stats = await VideoProcessingService.getCompressionStats(activeVideoPath, compressedVideo.path);
      setCompressionStats(stats);
      
      // Update video size info
      const newSizeInfo = await VideoProcessingService.checkVideoSize(compressedVideo.path);
      setVideoSizeInfo(newSizeInfo);
      
    } catch (error) {
        Alert.alert('compression error', 'failed to compress video. please try again.');
    } finally {
      setIsCompressing(false);
      setCompressionProgress(0);
    }
  };

  // removed legacy expo-av handlers (not used with expo-video)


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

  // Helper functions to get selected labels for display
  const getSelectedChannelLabel = () => {
    if (!selectedChannel) return 'Pick a channel';
    return selectedChannel.displayName.toLowerCase();
  };

  const getSelectedCommentFilterLabel = () => {
    if (!commentFilter) return 'Choose who can comment';
    const filter = COMMENT_FILTERS.find(f => f.id === commentFilter);
    return filter?.label.toLowerCase() || 'Choose who can comment';
  };

  const getSelectedContentWarningsLabel = () => {
    if (selectedContentWarnings.length === 0 && !otherWarning.trim()) {
      return 'Apply any warnings';
    }
    const warningLabels = selectedContentWarnings.map(id => {
      const warning = CONTENT_WARNINGS.find(w => w.id === id);
      return warning?.label.toLowerCase() || id;
    });
    if (otherWarning.trim()) {
      warningLabels.push('other');
    }
    return warningLabels.length > 0 ? warningLabels.join(', ') : 'Apply any warnings';
  };

  const handlePost = async () => {
    if (isPosting || isCompressing || isMerging) {
      if (isMerging) {
        Alert.alert('Please wait', 'Video is still being merged. Please wait for it to complete.');
      }
      return;
    }
    
    if (!activeVideoPath) {
      Alert.alert('error', 'no video selected');
      return;
    }

    // Path is already standardized and validated - trust it
    const videoPathToUse = compressedVideoPath || activeVideoPath;

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
      
      // Use compressed video if available, otherwise use the validated path
      const videoPathToUpload = compressedVideoPath || videoPathToUse;
      
      // Extract slug from channel URI to ensure it matches what the backend expects
      const channelSlug = selectedChannel 
        ? (extractFeedSlug(selectedChannel.uri) || selectedChannel.slug)
        : undefined;

      // Create the video post using AtprotoService
      const result = await AtprotoService.createVideoPost(
        description,
        videoPathToUpload,
        allContentWarnings.length > 0 ? allContentWarnings : undefined,
        (commentFilter || 'all') as 'all' | 'followers' | 'mentioned' | 'none',
        channelSlug // Pass channel slug for tagging (extracted from URI)
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


  // Resolved video path info
  const [videoPathInfo, setVideoPathInfo] = useState<VideoPathInfo | null>(null);
  
  // Resolve video path on mount or when activeVideoPath changes
  useEffect(() => {
    const resolveVideo = async () => {
      // Wait for merging to complete if in progress
      if (isMerging || !activeVideoPath) {
        if (isMerging) {
          setVideoLoading(true);
          setVideoError(null);
        }
        return;
      }

      // Debug the incoming path
      debugVideoPath('VideoPostScreen received', activeVideoPath);
      
      try {
        setVideoLoading(true);
        setVideoError(null);
        
        // Use the utility to resolve the path (handles iCloud, normalization, validation)
        const pathInfo = await resolveVideoPath(activeVideoPath);
        
        setVideoPathInfo(pathInfo);
        
        if (!pathInfo.exists) {
          setVideoError('Video file not found');
        }
      } catch (error) {
        console.error('[VideoPostScreen] Error resolving video path:', error);
        setVideoError('Unable to access video file');
      } finally {
        setVideoLoading(false);
      }
    };

    resolveVideo();
  }, [activeVideoPath, isMerging]);

  // Final video URI for playback
  const videoUri = videoPathInfo?.uri || '';

  // Create expo-video player without initial source; attach source when resolved
  const player = useVideoPlayer(null, (p) => {
    p.loop = true;
    p.volume = videoVolume;
    playerRef.current = p;
  });

  // Attach/replace source when `videoUri` becomes available
  useEffect(() => {
    if (!player) return;
    if (videoUri) {
      (async () => {
        try {
          await player.replaceAsync({ uri: videoUri });
          // Clear previous errors when replacing source
          setVideoError(null);
        } catch (e) {
          setVideoError('Failed to load video');
        }
      })();
    }
  }, [player, videoUri]);

  // Handle player status changes (support either string or object payload)
  (useEvent as any)(player, 'statusChange', (payload: any) => {
    const status = typeof payload === 'string' ? payload : payload?.status;
    if (status === 'loading') {
      setVideoLoading(true);
      setVideoError(null);
    } else if (status === 'readyToPlay') {
      setVideoLoading(false);
      if (player.currentTime === 0 && currentTime > 0) {
        player.currentTime = currentTime;
      }
    } else if (status === 'error') {
      setVideoLoading(false);
      setVideoError('Failed to load video');
    }
  });

  // Track playback progress
  useEffect(() => {
    if (!player) return;
    const interval = setInterval(() => {
      if (player.currentTime !== undefined) {
        setCurrentTime(player.currentTime);
        // First tick indicates frames are advancing; hide loading overlay
        if (videoLoading) {
          setVideoLoading(false);
        }
      }
    }, 100);
    return () => clearInterval(interval);
  }, [player]);

  // Sync play/pause state
  useEffect(() => {
    if (!player) return;
    if (isPlaying) {
      player.play();
    } else {
      player.pause();
    }
  }, [player, isPlaying]);

  // Update volume when videoVolume changes
  useEffect(() => {
    if (player) {
      player.volume = videoVolume;
    }
  }, [player, videoVolume]);

  // Handle keyboard visibility for input spacing
  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setIsKeyboardVisible(true)
    );
    const keyboardDidHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setIsKeyboardVisible(false)
    );

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);

  // Animate description modal fade
  useEffect(() => {
    if (showDescriptionInputModal) {
      Animated.timing(descriptionModalOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(descriptionModalOpacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [showDescriptionInputModal]);

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
            <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.landscapeInfoScroll, { paddingBottom: 40 }]}>
              <View style={styles.header}>
                <TouchableOpacity onPress={handleCancel} style={styles.headerButton}>
                  <BackArrowIcon size={32} color={Colors.white} />
                </TouchableOpacity>
              </View>
                        {/* Description Section */}
          <View style={styles.descriptionSection}>
            <Text style={[styles.sectionHeaderTitle, { marginBottom: 6 }]}>Description</Text>
            <TouchableOpacity 
              onPress={() => setShowDescriptionInputModal(true)}
              activeOpacity={0.7}
              style={styles.descriptionInputTouchable}
            >
              {description ? (
                <Text style={styles.descriptionInputPreview} numberOfLines={0}>
                  {(() => {
                    // Simple regex to find mentions and hashtags
                    const mentionRegex = /@[\w.-]+/g;
                    const hashtagRegex = /#[\w]+/g;
                    const parts: Array<{ text: string; isBold: boolean }> = [];
                    let lastIndex = 0;
                    const matches: Array<{ start: number; end: number }> = [];
                    
                    // Find all mentions
                    let match;
                    while ((match = mentionRegex.exec(description)) !== null) {
                      matches.push({ start: match.index, end: match.index + match[0].length });
                    }
                    
                    // Find all hashtags
                    while ((match = hashtagRegex.exec(description)) !== null) {
                      matches.push({ start: match.index, end: match.index + match[0].length });
                    }
                    
                    // Sort matches by position
                    matches.sort((a, b) => a.start - b.start);
                    
                    if (matches.length > 0) {
                      for (const m of matches) {
                        // Add text before match
                        if (m.start > lastIndex) {
                          const beforeText = description.slice(lastIndex, m.start);
                          if (beforeText) {
                            parts.push({ text: beforeText, isBold: false });
                          }
                        }
                        
                        // Add match text (bold for both mentions and hashtags)
                        const matchText = description.slice(m.start, m.end);
                        parts.push({ text: matchText, isBold: true });
                        
                        lastIndex = m.end;
                      }
                      
                      // Add remaining text
                      if (lastIndex < description.length) {
                        parts.push({ text: description.slice(lastIndex), isBold: false });
                      }
                    } else {
                      parts.push({ text: description, isBold: false });
                    }
                    
                    return parts.map((part, index) => (
                      <Text key={index} style={part.isBold ? styles.descriptionInputPreviewBold : styles.descriptionInputPreview}>
                        {part.text}
                      </Text>
                    ));
                  })()}
                </Text>
              ) : (
                <Text style={[styles.descriptionInputPreview, styles.descriptionInputPlaceholder]}>
                  Add text & tags (optional)
                </Text>
              )}
            </TouchableOpacity>
          </View>
              {/* Channel Selection */}
              <View style={styles.section}>
                <Text style={styles.sectionHeaderTitle}>Channel (optional)</Text>
                <TouchableOpacity 
                  style={styles.channelSelectorContainer}
                  onPress={() => setShowChannelSelectionSheet(true)}
                  activeOpacity={0.7}
                >
                  <View style={styles.channelSelectorBox}>
                    {!selectedChannel ? (
                      <Avatar
                        type="channel"
                        size={52}
                        fallbackIcon="device-tv"
                        fallbackIconColor={Colors.lightGray}
                        fallbackIconSize={32}
                      />
                    ) : (
                      <Avatar
                        uri={getChannelAvatarUri(selectedChannel.uri)}
                        type="channel"
                        size={52}
                      />
                    )}
                  </View>
                  {!selectedChannel ? (
                    <View style={styles.channelSelectorPlaceholderContainer}>
                      <Text style={styles.channelSelectorPlaceholderText}>Pick a channel</Text>
                      <DownSmallFillIcon size={20} color={Colors.gray} />
                    </View>
                  ) : (
                    <View style={styles.channelSelectorNameContainer}>
                      {shouldShowChannelSlash(selectedChannel.uri) && (
                        <Text style={[
                          styles.channelSelectorName, 
                          styles.orbytSlash, 
                          { 
                            color: selectedChannel.channelColor || '#FFD700',
                            fontFamily: 'Firma-SemiBold'
                          }
                        ]}>/</Text>
                      )}
                      <Text style={[styles.channelSelectorName, { fontFamily: 'Firma-Bold' }]}>
                        {selectedChannel.displayName.toLowerCase()}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
              {/* Comment Filtering */}
              <View style={styles.section}>
                <Text style={styles.sectionHeaderTitle}>Comments</Text>
                <TouchableOpacity 
                  style={styles.channelSelectorContainer}
                  onPress={() => setShowCommentSettingsSheet(true)}
                  activeOpacity={0.7}
                >
                  <View style={styles.channelSelectorBox}>
                    <Icon name="chat-3-line" size={32} color={Colors.lightGray} />
                  </View>
                  {!commentFilter ? (
                    <View style={styles.channelSelectorPlaceholderContainer}>
                      <Text style={styles.channelSelectorPlaceholderText}>{getSelectedCommentFilterLabel()}</Text>
                      <DownSmallFillIcon size={20} color={Colors.gray} />
                    </View>
                  ) : (
                    <View style={styles.channelSelectorNameContainer}>
                      <Text style={styles.channelSelectorName}>
                        {getSelectedCommentFilterLabel()}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
              {/* Content Warnings */}
              <View style={styles.section}>
                <Text style={styles.sectionHeaderTitle}>Warnings</Text>
                <TouchableOpacity 
                  style={styles.channelSelectorContainer}
                  onPress={() => setShowContentWarningsSheet(true)}
                  activeOpacity={0.7}
                >
                  <View style={styles.channelSelectorBox}>
                    <Icon name="warning-line" size={32} color={Colors.lightGray} />
                  </View>
                  {selectedContentWarnings.length === 0 && !otherWarning.trim() ? (
                    <View style={styles.channelSelectorPlaceholderContainer}>
                      <Text style={styles.channelSelectorPlaceholderText}>{getSelectedContentWarningsLabel()}</Text>
                      <DownSmallFillIcon size={20} color={Colors.gray} />
                    </View>
                  ) : (
                    <View style={styles.channelSelectorNameContainer}>
                      <Text style={styles.channelSelectorName}>
                        {getSelectedContentWarningsLabel()}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
              {/* Post Button */}
              <View style={[styles.landscapePostButtonContainer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                <TouchableOpacity 
                  onPress={handlePost}
                  disabled={isPosting || isCompressing}
                  activeOpacity={0.8}
                >
                  {Platform.OS === 'ios' && isLiquidGlassAvailable() ? (
                    <GlassView
                      style={[styles.landscapePostButtonGlass, { width: SCREEN_WIDTH * 0.6 }]}
                      glassEffectStyle="clear"
                      tintColor="rgba(255,255,255,0.9)"
                      isInteractive
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
                        ) : isCompressing ? (
                          <View style={styles.loadingContainer}>
                            <Loading3FillIcon size={24} color={Colors.black} />
                            <Text style={styles.postButtonText}>
                              Getting ready...
                            </Text>
                          </View>
                        ) : (
                          <Text style={styles.postButtonText}>POST</Text>
                        )}
                      </View>
                    </GlassView>
                  ) : (
                    <View 
                      style={[
                        styles.landscapePostButtonHost, 
                        { width: SCREEN_WIDTH * 0.6 }, 
                        (isPosting || isCompressing) && styles.landscapePostButtonDisabled
                      ]}
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
                        ) : isCompressing ? (
                          <View style={styles.loadingContainer}>
                            <Loading3FillIcon size={24} color={Colors.black} />
                            <Text style={styles.postButtonText}>
                              Getting ready...
                            </Text>
                          </View>
                        ) : (
                          <Text style={styles.postButtonText}>POST</Text>
                        )}
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
          {/* Right: Video Preview Side */}
          <View style={styles.landscapeVideoSide}>
            <View style={styles.previewSection}>
              <View style={[styles.videoContainer, { width: '100%', aspectRatio: ASPECT_RATIO, maxHeight: '90%' }]}> 
                {/* Blurred thumbnail background */}
                {(thumbnailPath || videoUri) && <BlurredThumbnailBackground thumbnailUrl={thumbnailPath || videoUri} />}
                {(videoLoading || isMerging) && (
                  <View style={[styles.video, { justifyContent: 'center', alignItems: 'center', position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 2, backgroundColor: 'transparent' }]}> 
                    <Loading3FillIcon size={48} color={Colors.white} />
                  </View>
                )}
                <View style={{ width: '100%', aspectRatio: ASPECT_RATIO, justifyContent: 'center', alignItems: 'center', position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 1 }}>
                  {videoUri && player ? (
                      <VideoView
                        player={player}
                        style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}
                        contentFit="contain"
                        nativeControls={false}
                      />
                  ) : null}
                </View>
                {videoError && (
                  <View style={[styles.video, { justifyContent: 'center', alignItems: 'center', position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 3, backgroundColor: Colors.darkGray }]}> 
                    <Text style={{ color: Colors.lightGray, fontSize: 16 }}>{videoError && videoError.toLowerCase()}</Text>
                  </View>
                )}
                {!videoLoading && !isMerging && !videoError && textOverlays && textOverlays.length > 0 && textOverlays.map((overlay: TextOverlay) => (
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
              </View>
            </View>
          </View>
        </View>

        {/* Full-Screen Description Input Modal */}
        <Modal
          visible={showDescriptionInputModal}
          transparent={true}
          animationType="none"
          onRequestClose={() => setShowDescriptionInputModal(false)}
        >
          <View style={styles.descriptionModalContainer}>
            <Animated.View style={[styles.descriptionModalOverlay, { opacity: descriptionModalOpacity }]}>
              <View style={[styles.descriptionModalContentWrapper, { paddingTop: insets.top }]}>
                <View style={styles.descriptionModalHeader}>
                  <View style={styles.descriptionModalHeaderSpacer} />
                  <Text style={styles.descriptionModalTitle}>Description</Text>
                  <TouchableOpacity 
                    onPress={() => setShowDescriptionInputModal(false)}
                    style={styles.descriptionModalDoneButton}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.descriptionModalDoneText}>Done</Text>
                  </TouchableOpacity>
                </View>
                <KeyboardAvoidingView 
                  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                  style={styles.descriptionModalContent}
                >
                <View style={styles.descriptionInputWrapper}>
                  <TextInput
                    {...richTextInputProps}
                    style={[styles.descriptionModalInput, { height: descriptionInputHeight, color: description.length > 0 ? 'transparent' : Colors.white }]}
                    placeholder="Add text & tags (optional)"
                    placeholderTextColor={Colors.gray}
                    multiline
                    maxLength={300}
                    autoFocus={true}
                    textAlignVertical="top"
                    onContentSizeChange={(e) => {
                      const newHeight = Math.min(Math.max(24, e.nativeEvent.contentSize.height + 8), 400);
                      setDescriptionInputHeight(newHeight);
                    }}
                  />
                  {description.length > 0 && (
                    <View style={[styles.descriptionPreview, { height: descriptionInputHeight }]}>
                      {(() => {
                        // Simple regex to find mentions and hashtags
                        const mentionRegex = /@[\w.-]+/g;
                        const hashtagRegex = /#[\w]+/g;
                        const parts: Array<{ text: string; isBold: boolean }> = [];
                        let lastIndex = 0;
                        const matches: Array<{ start: number; end: number }> = [];
                        
                        // Find all mentions
                        let match;
                        while ((match = mentionRegex.exec(description)) !== null) {
                          matches.push({ start: match.index, end: match.index + match[0].length });
                        }
                        
                        // Find all hashtags
                        while ((match = hashtagRegex.exec(description)) !== null) {
                          matches.push({ start: match.index, end: match.index + match[0].length });
                        }
                        
                        // Sort matches by position
                        matches.sort((a, b) => a.start - b.start);
                        
                        if (matches.length > 0) {
                          for (const m of matches) {
                            // Add text before match
                            if (m.start > lastIndex) {
                              const beforeText = description.slice(lastIndex, m.start);
                              if (beforeText) {
                                parts.push({ text: beforeText, isBold: false });
                              }
                            }
                            
                            // Add match text (bold for both mentions and hashtags)
                            const matchText = description.slice(m.start, m.end);
                            parts.push({ text: matchText, isBold: true });
                            
                            lastIndex = m.end;
                          }
                          
                          // Add remaining text
                          if (lastIndex < description.length) {
                            parts.push({ text: description.slice(lastIndex), isBold: false });
                          }
                        } else {
                          parts.push({ text: description, isBold: false });
                        }
                        
                        return (
                          <Text style={styles.descriptionPreviewText} numberOfLines={0}>
                            {parts.map((part, index) => (
                              <Text key={index} style={part.isBold ? styles.descriptionPreviewBold : styles.descriptionPreviewNormal}>
                                {part.text}
                              </Text>
                            ))}
                          </Text>
                        );
                      })()}
                    </View>
                  )}
                </View>
                  {richTextSearchModalProps.visible && (
                    <RichTextSearchModal
                      {...richTextSearchModalProps}
                    />
                  )}
                </KeyboardAvoidingView>
              </View>
            </Animated.View>
          </View>
        </Modal>

        {/* Content Warnings Sheet */}
        <VerticalListSheet
          visible={showContentWarningsSheet}
          onDismiss={() => setShowContentWarningsSheet(false)}
          title={getSelectedContentWarningsLabel()}
          name="post-content-warnings-sheet"
          detents={['auto']}
          showCancelButton={true}
          cancelButtonText="Close"
        >
          <View style={styles.sheetContent}>
            <Text style={styles.sheetSectionHeader}>Content</Text>
            {CONTENT_WARNINGS.map(warning => (
              <TouchableOpacity
                key={warning.id}
                style={styles.sheetOptionRow}
                onPress={() => toggleContentWarning(warning.id)}
                activeOpacity={0.7}
              >
                <Text style={styles.sheetOptionText}>{warning.label.toLowerCase()}</Text>
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
              style={styles.sheetOptionRow}
              onPress={() => setShowContentWarningInput(!showContentWarningInput)}
              activeOpacity={0.7}
            >
              <Text style={styles.sheetOptionText}>other warning</Text>
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
              <View style={[styles.sheetInputContainer, isKeyboardVisible && styles.sheetInputContainerKeyboard]}>
                <TextInput
                  style={styles.otherWarningInput}
                  placeholder="specify content warning"
                  placeholderTextColor={Colors.lightGray}
                  value={otherWarning}
                  onChangeText={setOtherWarning}
                  autoFocus={true}
                  returnKeyType="done"
                />
              </View>
            )}
          </View>
        </VerticalListSheet>

        {/* Comment Settings Sheet */}
        <VerticalListSheet
          visible={showCommentSettingsSheet}
          onDismiss={() => setShowCommentSettingsSheet(false)}
          title={getSelectedCommentFilterLabel()}
          name="post-comment-settings-sheet"
          detents={['auto']}
          showCancelButton={true}
          cancelButtonText="Close"
        >
          <View style={styles.sheetContent}>
            <Text style={styles.sheetSectionHeader}>Comments</Text>
            {COMMENT_FILTERS.map(filter => (
              <VerticalListButton
                key={filter.id}
                label={filter.label.toLowerCase()}
                onPress={() => {
                  setCommentFilter(filter.id);
                  setShowCommentSettingsSheet(false);
                }}
                disabled={commentFilter === filter.id}
              />
            ))}
          </View>
        </VerticalListSheet>

        {/* Channel Selection Sheet */}
        <VerticalListSheet
          visible={showChannelSelectionSheet}
          onDismiss={() => setShowChannelSelectionSheet(false)}
          title="Pick a channel"
          name="post-channel-selection-sheet"
          detents={['auto']}
          showCancelButton={true}
          cancelButtonText="Cancel"
          titleSize={28}
          hideCloseButton={true}
        >
          <ScrollView 
            style={styles.sheetContent}
            contentContainerStyle={[styles.sheetContentContainer, { paddingBottom: 80 + insets.bottom }]}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={true}
          >
            <VerticalListButton
              label="none"
              onPress={() => {
                setSelectedChannel(null);
                setShowChannelSelectionSheet(false);
              }}
              disabled={selectedChannel === null}
            />
            {getPostableChannels().map(channel => (
              <TouchableOpacity
                key={channel.slug}
                style={[
                  styles.channelListButton,
                  selectedChannel?.slug === channel.slug && { opacity: 0.5 }
                ]}
                onPress={() => {
                  setSelectedChannel(channel);
                  setShowChannelSelectionSheet(false);
                }}
                activeOpacity={0.7}
                disabled={selectedChannel?.slug === channel.slug}
              >
                <View style={styles.listButtonContent}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {shouldShowChannelSlash(channel.uri) && (
                      <Text style={[
                        styles.channelListButtonText, 
                        styles.orbytSlash, 
                        { 
                          color: channel.channelColor || '#FFD700',
                          fontFamily: 'Firma-SemiBold'
                        }
                      ]}>/</Text>
                    )}
                    <Text style={[styles.channelListButtonText, { fontFamily: 'Firma-Bold' }]}>
                      {channel.displayName.toLowerCase()}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </VerticalListSheet>

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
        <ScrollView 
          style={styles.scrollView} 
          contentContainerStyle={[
            styles.scrollViewContentContainer,
            { paddingBottom: 60 + Math.max(insets.bottom, 20) + 80 }
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleCancel} style={styles.headerButton}>
              <BackArrowIcon size={32} color={Colors.white} />
            </TouchableOpacity>
          </View>
          {/* Video Preview Section */}
          <View style={styles.previewSection}>
            <View style={[styles.videoContainer, { width: containerWidth, height: containerHeight }]}>
              {/* Blurred thumbnail background */}
              {(thumbnailPath || videoUri) && <BlurredThumbnailBackground thumbnailUrl={thumbnailPath || videoUri} />}
              {/* Show loading indicator while video is loading */}
              {(videoLoading || isMerging) && (
                <View style={[styles.video, { justifyContent: 'center', alignItems: 'center', position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 2, backgroundColor: 'transparent' }]}>
                  <Loading3FillIcon size={48} color={Colors.white} />
                </View>
              )}
              <View style={{ width: containerWidth, height: containerHeight, justifyContent: 'center', alignItems: 'center', position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 1 }}>
                {videoUri && player ? (
                  <VideoView
                    player={player}
                    style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}
                    contentFit="contain"
                    nativeControls={false}
                  />
                ) : null}
              </View>
              {/* Error message if video fails to load */}
              {videoError && (
                <View style={[styles.video, { justifyContent: 'center', alignItems: 'center', position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 3, backgroundColor: Colors.darkGray }]}> 
                  <Text style={{ color: Colors.lightGray, fontSize: 16 }}>{videoError}</Text>
                </View>
              )}
              {/* Text Overlays - only show if they exist */}
              {!videoLoading && !isMerging && !videoError && textOverlays && textOverlays.length > 0 && textOverlays.map((overlay: TextOverlay) => (
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
            </View>
          </View>
          
          {/* Description Section */}
          <View style={[styles.descriptionSection, { marginTop: containerHeight, paddingTop: 0 }]}>
            <Text style={[styles.sectionHeaderTitle, { marginBottom: 0}]}>Description</Text>
            <TouchableOpacity 
              onPress={() => setShowDescriptionInputModal(true)}
              activeOpacity={0.7}
              style={styles.descriptionInputTouchable}
            >
              {description ? (
                <Text style={styles.descriptionInputPreview} numberOfLines={0}>
                  {(() => {
                    // Simple regex to find mentions and hashtags
                    const mentionRegex = /@[\w.-]+/g;
                    const hashtagRegex = /#[\w]+/g;
                    const parts: Array<{ text: string; isBold: boolean }> = [];
                    let lastIndex = 0;
                    const matches: Array<{ start: number; end: number }> = [];
                    
                    // Find all mentions
                    let match;
                    while ((match = mentionRegex.exec(description)) !== null) {
                      matches.push({ start: match.index, end: match.index + match[0].length });
                    }
                    
                    // Find all hashtags
                    while ((match = hashtagRegex.exec(description)) !== null) {
                      matches.push({ start: match.index, end: match.index + match[0].length });
                    }
                    
                    // Sort matches by position
                    matches.sort((a, b) => a.start - b.start);
                    
                    if (matches.length > 0) {
                      for (const m of matches) {
                        // Add text before match
                        if (m.start > lastIndex) {
                          const beforeText = description.slice(lastIndex, m.start);
                          if (beforeText) {
                            parts.push({ text: beforeText, isBold: false });
                          }
                        }
                        
                        // Add match text (bold for both mentions and hashtags)
                        const matchText = description.slice(m.start, m.end);
                        parts.push({ text: matchText, isBold: true });
                        
                        lastIndex = m.end;
                      }
                      
                      // Add remaining text
                      if (lastIndex < description.length) {
                        parts.push({ text: description.slice(lastIndex), isBold: false });
                      }
                    } else {
                      parts.push({ text: description, isBold: false });
                    }
                    
                    return parts.map((part, index) => (
                      <Text key={index} style={part.isBold ? styles.descriptionInputPreviewBold : styles.descriptionInputPreview}>
                        {part.text}
                      </Text>
                    ));
                  })()}
                </Text>
              ) : (
                <Text style={[styles.descriptionInputPreview, styles.descriptionInputPlaceholder]}>
                  Add text & tags (optional)
                </Text>
              )}
            </TouchableOpacity>
          </View>
          
          {/* Channel Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionHeaderTitle}>Channel (optional)</Text>
            <TouchableOpacity 
              style={styles.channelSelectorContainer}
              onPress={() => setShowChannelSelectionSheet(true)}
              activeOpacity={0.7}
            >
              <View style={styles.channelSelectorBox}>
                {!selectedChannel ? (
                  <Avatar
                    type="channel"
                    size={52}
                    ringColor="transparent"
                    fallbackIcon="device-tv"
                    fallbackIconColor={Colors.lightGray}
                    fallbackIconSize={32}
                  />
                ) : (
                  <Avatar
                    uri={getChannelAvatarUri(selectedChannel.uri)}
                    type="channel"
                    size={52}
                    ringColor="transparent"
                  />
                )}
              </View>
              {!selectedChannel ? (
                <View style={styles.channelSelectorPlaceholderContainer}>
                  <Text style={styles.channelSelectorPlaceholderText}>Pick a channel</Text>
                  <DownSmallFillIcon size={20} color={Colors.gray} />
                </View>
              ) : (
                <View style={styles.channelSelectorNameContainer}>
                  {shouldShowChannelSlash(selectedChannel.uri) && (
                    <Text style={[
                      styles.channelSelectorName, 
                      styles.orbytSlash, 
                      { 
                        color: selectedChannel.channelColor || '#FFD700',
                        fontFamily: 'Firma-SemiBold'
                      }
                    ]}>/</Text>
                  )}
                  <Text style={styles.channelSelectorName}>
                    {selectedChannel.displayName.toLowerCase()}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
          
          {/* Comment Filtering Section */}
          <View style={styles.section}>
            <Text style={styles.sectionHeaderTitle}>Comments</Text>
            <TouchableOpacity 
              style={styles.channelSelectorContainer}
              onPress={() => setShowCommentSettingsSheet(true)}
              activeOpacity={0.7}
            >
              <View style={styles.channelSelectorBox}>
                <Icon name="chat-3-line" size={32} color={Colors.lightGray} />
              </View>
              {!commentFilter ? (
                <View style={styles.channelSelectorPlaceholderContainer}>
                  <Text style={styles.channelSelectorPlaceholderText}>{getSelectedCommentFilterLabel()}</Text>
                  <DownSmallFillIcon size={20} color={Colors.gray} />
                </View>
              ) : (
                <View style={styles.channelSelectorNameContainer}>
                  <Text style={styles.channelSelectorName}>
                    {getSelectedCommentFilterLabel()}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
          
          {/* Content Warning Section */}
          <View style={styles.section}>
            <Text style={styles.sectionHeaderTitle}>Warnings</Text>
            <TouchableOpacity 
              style={styles.channelSelectorContainer}
              onPress={() => setShowContentWarningsSheet(true)}
              activeOpacity={0.7}
            >
              <View style={styles.channelSelectorBox}>
                <Icon name="warning-line" size={32} color={Colors.lightGray} />
              </View>
              {selectedContentWarnings.length === 0 && !otherWarning.trim() ? (
                <View style={styles.channelSelectorPlaceholderContainer}>
                  <Text style={styles.channelSelectorPlaceholderText}>{getSelectedContentWarningsLabel()}</Text>
                  <DownSmallFillIcon size={20} color={Colors.gray} />
                </View>
              ) : (
                <View style={styles.channelSelectorNameContainer}>
                  <Text style={styles.channelSelectorName}>
                    {getSelectedContentWarningsLabel()}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
          
          
        </ScrollView>
        

        
        <View style={[styles.floatingPostButtonContainer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <TouchableOpacity 
            onPress={handlePost}
            disabled={isPosting || isCompressing}
            activeOpacity={0.8}
          >
            {Platform.OS === 'ios' && isLiquidGlassAvailable() ? (
              <GlassView
                style={[styles.floatingPostButtonGlass, { width: SCREEN_WIDTH * 0.6 }]}
                glassEffectStyle="clear"
                tintColor="rgba(255,255,255,0.9)"
                isInteractive
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
                  ) : isCompressing ? (
                    <View style={styles.loadingContainer}>
                      <Loading3FillIcon size={24} color={Colors.black} />
                      <Text style={styles.postButtonText}>
                        Getting ready...
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.postButtonText}>POST</Text>
                  )}
                </View>
              </GlassView>
            ) : (
              <View 
                style={[
                  styles.floatingPostButtonHost, 
                  { width: SCREEN_WIDTH * 0.6 }, 
                  (isPosting || isCompressing) && styles.floatingPostButtonDisabled
                ]}
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
                  ) : isCompressing ? (
                    <View style={styles.loadingContainer}>
                      <Loading3FillIcon size={24} color={Colors.black} />
                      <Text style={styles.postButtonText}>
                        Getting ready...
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.postButtonText}>POST</Text>
                  )}
                </View>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Full-Screen Description Input Modal */}
      <Modal
        visible={showDescriptionInputModal}
        transparent={true}
        animationType="none"
        onRequestClose={() => setShowDescriptionInputModal(false)}
      >
        <View style={styles.descriptionModalContainer}>
          <Animated.View style={[styles.descriptionModalOverlay, { opacity: descriptionModalOpacity }]}>
            <View style={[styles.descriptionModalContentWrapper, { paddingTop: insets.top }]}>
              <View style={styles.descriptionModalHeader}>
                <View style={styles.descriptionModalHeaderSpacer} />
                <Text style={styles.descriptionModalTitle}>Description</Text>
                <TouchableOpacity 
                  onPress={() => setShowDescriptionInputModal(false)}
                  style={[
                    styles.descriptionModalDoneButton,
                    description.length > 300 && styles.descriptionModalDoneButtonDisabled
                  ]}
                  activeOpacity={0.7}
                  disabled={description.length > 300}
                >
                  <Text style={[
                    styles.descriptionModalDoneText,
                    description.length > 300 && styles.descriptionModalDoneTextDisabled
                  ]}>
                    {description.length > 300 ? `+${description.length - 300}` : 'Done'}
                  </Text>
                </TouchableOpacity>
              </View>
              <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.descriptionModalContent}
              >
                <View style={styles.descriptionInputWrapper}>
                  <TextInput
                    {...richTextInputProps}
                    style={[styles.descriptionModalInput, { height: descriptionInputHeight, color: description.length > 0 ? 'transparent' : Colors.white }]}
                    placeholder="Add text & tags (optional)"
                    placeholderTextColor={Colors.gray}
                    multiline
                    maxLength={300}
                    autoFocus={true}
                    textAlignVertical="top"
                    onContentSizeChange={(e) => {
                      const newHeight = Math.min(Math.max(24, e.nativeEvent.contentSize.height + 8), 400);
                      setDescriptionInputHeight(newHeight);
                    }}
                  />
                  {description.length > 0 && (
                    <View style={[styles.descriptionPreview, { height: descriptionInputHeight }]}>
                      {(() => {
                        // Simple regex to find mentions and hashtags
                        const mentionRegex = /@[\w.-]+/g;
                        const hashtagRegex = /#[\w]+/g;
                        const parts: Array<{ text: string; isBold: boolean }> = [];
                        let lastIndex = 0;
                        const matches: Array<{ start: number; end: number }> = [];
                        
                        // Find all mentions
                        let match;
                        while ((match = mentionRegex.exec(description)) !== null) {
                          matches.push({ start: match.index, end: match.index + match[0].length });
                        }
                        
                        // Find all hashtags
                        while ((match = hashtagRegex.exec(description)) !== null) {
                          matches.push({ start: match.index, end: match.index + match[0].length });
                        }
                        
                        // Sort matches by position
                        matches.sort((a, b) => a.start - b.start);
                        
                        if (matches.length > 0) {
                          for (const m of matches) {
                            // Add text before match
                            if (m.start > lastIndex) {
                              const beforeText = description.slice(lastIndex, m.start);
                              if (beforeText) {
                                parts.push({ text: beforeText, isBold: false });
                              }
                            }
                            
                            // Add match text (bold for both mentions and hashtags)
                            const matchText = description.slice(m.start, m.end);
                            parts.push({ text: matchText, isBold: true });
                            
                            lastIndex = m.end;
                          }
                          
                          // Add remaining text
                          if (lastIndex < description.length) {
                            parts.push({ text: description.slice(lastIndex), isBold: false });
                          }
                        } else {
                          parts.push({ text: description, isBold: false });
                        }
                        
                        return (
                          <Text style={styles.descriptionPreviewText} numberOfLines={0}>
                            {parts.map((part, index) => (
                              <Text key={index} style={part.isBold ? styles.descriptionPreviewBold : styles.descriptionPreviewNormal}>
                                {part.text}
                              </Text>
                            ))}
                          </Text>
                        );
                      })()}
                    </View>
                  )}
                </View>
                {richTextSearchModalProps.visible && (
                  <View style={styles.searchResultsContainer}>
                    <RichTextSearchModal
                      {...richTextSearchModalProps}
                    />
                  </View>
                )}
              </KeyboardAvoidingView>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* Content Warnings Sheet */}
      <VerticalListSheet
        visible={showContentWarningsSheet}
        onDismiss={() => setShowContentWarningsSheet(false)}
        title={getSelectedContentWarningsLabel()}
        name="post-content-warnings-sheet"
        detents={['auto']}
        showCancelButton={true}
        cancelButtonText="Close"
      >
        <View style={styles.sheetContent}>
          {CONTENT_WARNINGS.map(warning => (
            <TouchableOpacity
              key={warning.id}
              style={styles.sheetOptionRow}
              onPress={() => toggleContentWarning(warning.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.sheetOptionText}>{warning.label.toLowerCase()}</Text>
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
            style={styles.sheetOptionRow}
            onPress={() => setShowContentWarningInput(!showContentWarningInput)}
            activeOpacity={0.7}
          >
            <Text style={styles.sheetOptionText}>other warning</Text>
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
            <View style={[styles.sheetInputContainer, isKeyboardVisible && styles.sheetInputContainerKeyboard]}>
              <TextInput
                style={styles.otherWarningInput}
                placeholder="specify content warning"
                placeholderTextColor={Colors.lightGray}
                value={otherWarning}
                onChangeText={setOtherWarning}
                autoFocus={true}
                returnKeyType="done"
              />
            </View>
          )}
        </View>
      </VerticalListSheet>

      {/* Comment Settings Sheet */}
      <VerticalListSheet
        visible={showCommentSettingsSheet}
        onDismiss={() => setShowCommentSettingsSheet(false)}
        title={getSelectedCommentFilterLabel()}
        name="post-comment-settings-sheet"
        detents={['auto']}
        showCancelButton={true}
        cancelButtonText="Close"
      >
        <View style={styles.sheetContent}>
          {COMMENT_FILTERS.map(filter => (
            <VerticalListButton
              key={filter.id}
              label={filter.label.toLowerCase()}
              onPress={() => {
                setCommentFilter(filter.id);
                setShowCommentSettingsSheet(false);
              }}
              disabled={commentFilter === filter.id}
            />
          ))}
        </View>
      </VerticalListSheet>

      {/* Channel Selection Sheet */}
      <VerticalListSheet
        visible={showChannelSelectionSheet}
        onDismiss={() => setShowChannelSelectionSheet(false)}
        title="Pick a channel"
        name="post-channel-selection-sheet"
        detents={['auto']}
        showCancelButton={true}
        cancelButtonText="Close"
        titleSize={26}
        hideCloseButton={true}
      >
        <ScrollView 
          style={styles.sheetContent}
          contentContainerStyle={[styles.sheetContentContainer, { paddingBottom: 80 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled={true}
        >
          <VerticalListButton
            label="none"
            onPress={() => {
              setSelectedChannel(null);
              setShowChannelSelectionSheet(false);
            }}
            disabled={selectedChannel === null}
          />
          {getPostableChannels().map(channel => (
            <TouchableOpacity
              key={channel.slug}
              style={styles.channelListButton}
              onPress={() => {
                setSelectedChannel(channel);
                setShowChannelSelectionSheet(false);
              }}
              activeOpacity={0.7}
              disabled={selectedChannel?.slug === channel.slug}
            >
              <View style={styles.listButtonContent}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {shouldShowChannelSlash(channel.uri) && (
                    <Text style={[
                      styles.channelListButtonText, 
                      styles.orbytSlash, 
                      { 
                        color: channel.channelColor || '#FFD700',
                        fontFamily: 'Firma-SemiBold'
                      }
                    ]}>/</Text>
                  )}
                  <Text style={[styles.channelListButtonText, { fontFamily: 'Firma-Bold' }]}>
                    {channel.displayName.toLowerCase()}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </VerticalListSheet>

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
    color: Colors.lightGray,
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
    position: 'absolute',
    top: 22, // Align preview top with button center (button height 44 / 2 = 22)
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingVertical: 0,
  },
  videoContainer: {
    backgroundColor: Colors.black,
    position: 'relative',
    overflow: 'hidden',
    alignSelf: 'center',
    borderRadius: BORDER_RADIUS.SMALL,
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
    color: Colors.lightGray,
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
    color: Colors.lightGray,
    fontSize: 12,
    fontFamily: 'Firma-Regular',
  },
  descriptionSection: {
    padding: 15,
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
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Firma-Medium',
  },
  descriptionInput: {
    color: Colors.lightGray,
    fontFamily: 'Firma-Regular',
    fontSize: 16,
    minHeight: 80,
    maxHeight: 150,
    textAlignVertical: 'top',
    paddingBottom: 20,
    marginTop: -8,
  },
  section: {
    padding: 15,
  },
  sectionHeaderTitle: {
    color: Colors.lightGray,
    fontSize: 18,
    fontFamily: 'Firma-SemiBold',
    marginBottom: 12,
  },
  sectionSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.LARGE,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  sectionSelectorContent: {
    flex: 1,
  },
  sectionSelectorText: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Firma-SemiBold',
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
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Firma-Bold',
  },
  orbytSlash: {
    fontFamily: 'Firma-SemiBold',
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
    borderBottomWidth: 1,
    borderBottomColor: Colors.lightGray,
    paddingVertical: 12,
    paddingHorizontal: 0,
    color: Colors.lightGray,
    marginTop: 5,
    marginBottom: 10,
    fontFamily: 'Firma-Regular',
    fontSize: 18,
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
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  floatingPostButtonHost: {
    height: 60,
    borderRadius: BORDER_RADIUS.FULL,
    backgroundColor: Colors.lightGray,
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
    borderRadius: BORDER_RADIUS.FULL,
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
    opacity: 0.5,
  },
  landscapePostButtonDisabled: {
    opacity: 0.5,
  },
  floatingButtonLoadingText: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Firma-SemiBold',
  },

  scrollViewContentContainer: {
    flexGrow: 1,
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
    paddingBottom: 80,
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
    borderRadius: BORDER_RADIUS.FULL,
    backgroundColor: Colors.lightGray,
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
    borderRadius: BORDER_RADIUS.FULL,
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
  sheetContent: {
    paddingHorizontal: 0,
  },
  sheetContentContainer: {
    paddingHorizontal: 0,
  },
  channelListButton: {
    borderRadius: BORDER_RADIUS.LARGE,
    paddingVertical: 20,
    paddingHorizontal: 20,
    marginHorizontal: 12,
    marginBottom: 12,
    backgroundColor: Colors.darkGray,
    overflow: 'hidden',
    borderWidth: 0,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    opacity: 1,
  },
  channelListButtonText: {
    color: Colors.lightGray,
    fontFamily: 'Firma-SemiBold',
    fontSize: 18,
  },
  listButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
  },
  sheetSectionHeader: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Firma-Regular',
    marginBottom: 12,
    marginHorizontal: 12,
    marginTop: 4,
  },
  sheetOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
    paddingHorizontal: 20,
    marginHorizontal: 12,
    marginBottom: 12,
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.LARGE,
  },
  sheetOptionText: {
    color: Colors.lightGray,
    fontSize: 18,
    fontFamily: 'Firma-SemiBold',
    flex: 1,
  },
  sheetInputContainer: {
    marginHorizontal: 12,
    marginBottom: 12,
  },
  sheetInputContainerKeyboard: {
    paddingBottom: 20,
  },
  descriptionInputTouchable: {
    minHeight: 80,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  descriptionInputPreview: {
    color: Colors.lightGray,
    fontFamily: 'Firma-Regular',
    fontSize: 16,
    lineHeight: 24,
  },
  descriptionInputPreviewBold: {
    color: Colors.lightGray,
    fontFamily: 'Firma-Bold',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 'bold',
  },
  descriptionInputPlaceholder: {
    color: Colors.gray,
  },
  descriptionModalContainer: {
    flex: 1,
  },
  descriptionModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
  },
  descriptionModalContentWrapper: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  descriptionModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  descriptionModalHeaderSpacer: {
    width: 60,
  },
  descriptionModalTitle: {
    color: Colors.lightGray,
    fontSize: 18,
    fontFamily: 'Firma-SemiBold',
  },
  descriptionModalDoneButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  descriptionModalDoneText: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Firma-SemiBold',
  },
  descriptionModalDoneTextDisabled: {
    color: Colors.red,
  },
  descriptionModalDoneButtonDisabled: {
    opacity: 0.5,
  },
  descriptionModalContent: {
    flex: 1,
    padding: 15,
    paddingTop: 8,
  },
  descriptionModalInput: {
    color: Colors.lightGray,
    fontFamily: 'Firma-Regular',
    fontSize: 16,
    textAlignVertical: 'top',
  },
  descriptionInputWrapper: {
    width: '100%',
    position: 'relative',
  },
  descriptionPreview: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    pointerEvents: 'none',
  },
  descriptionPreviewText: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Firma-Regular',
    textAlignVertical: 'top',
  },
  descriptionPreviewNormal: {
    color: Colors.lightGray,
    fontFamily: 'Firma-Regular',
  },
  descriptionPreviewBold: {
    color: Colors.lightGray,
    fontFamily: 'Firma-Bold',
    fontWeight: 'bold',
  },
  searchResultsContainer: {
    flex: 1,
  },
  channelSelectorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  channelSelectorBox: {
    width: 52,
    height: 52,
    backgroundColor: Colors.darkGray,
    borderRadius: BORDER_RADIUS.SMALL,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  channelSelectorPlaceholderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  channelSelectorPlaceholderText: {
    color: Colors.lightGray,
    fontSize: 18,
    fontFamily: 'Firma-Medium',
  },
  channelSelectorNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  channelSelectorName: {
    color: Colors.white,
    fontSize: 18,
    fontFamily: 'Firma-Medium',
  },

});

export default VideoPostScreen;