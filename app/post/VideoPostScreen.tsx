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
  Keyboard,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useVideoPlayer, VideoView, VideoPlayer } from 'expo-video';
import { useEvent } from 'expo';
import { File, Directory, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Image } from 'expo-image';
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
import { isTablet, isSmallScreen } from '../../src/utils/helpers';
import { useCurrentUser, useAccountManagement } from '../../src/stores/userStore';
import { useProfile, useProfileColors } from '../../src/services/cache/ProfileCache';
import ProfileCache from '../../src/services/cache/ProfileCache';
import AtprotoService from '../../src/services/api/AtprotoService';
import VideoProcessingService from '../../src/services/VideoProcessingService';
import { logger } from '../../src/utils/logger';
import { useVideoPostDraftStore } from '../../src/stores/videoPostDraftStore';
import { SavedAccount } from '../../src/stores/userStore';
import { getPostableChannels, shouldShowChannelSlash, OrbytChannel, extractFeedSlug, getChannelAvatarUri } from '../../src/utils/orbytChannels';
import VerticalListSheet, { VerticalListButton } from '../../src/components/ui/VerticalListSheet';
import { useRichTextSearchTrigger, RichTextSearchModal } from '../../src/components/ui/usersearch';
import { useRichText, formatRichTextForDisplay } from '../../src/hooks/useRichText';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ASPECT_RATIO = 9 / 16; // 9:16 aspect ratio for video cards
const VIDEO_WIDTH = SCREEN_WIDTH * 0.33; // Slightly smaller preview

// Reusable video preview component to avoid duplication
const VideoPreviewContent: React.FC<{
  thumbnailPath?: string;
  videoUri: string;
  player: VideoPlayer | null;
  videoLoading: boolean;
  isMerging: boolean;
  videoError: string | null;
  textOverlays: TextOverlay[];
  containerStyle?: any;
}> = ({ thumbnailPath, videoUri, player, videoLoading, isMerging, videoError, textOverlays, containerStyle }) => {
  const thumbnailUrl = thumbnailPath || videoUri;
  
  return (
    <View style={[styles.videoContainer, containerStyle]}>
      {thumbnailUrl && (
        <>
          <BlurredThumbnailBackground thumbnailUrl={thumbnailUrl} />
          {!videoLoading && !isMerging && (
            <Image source={{ uri: thumbnailUrl }} contentFit="contain" style={styles.poster} />
          )}
        </>
      )}
      {videoUri && player && (
        <VideoView player={player} style={styles.videoPlayer} contentFit="contain" nativeControls={false} />
      )}
      {(videoLoading || isMerging) && (
        <View style={styles.loadingOverlay}>
          <Loading3FillIcon size={48} color={Colors.white} />
        </View>
      )}
      {videoError && (
        <View style={[styles.loadingOverlay, { zIndex: 3, backgroundColor: Colors.darkGray }]}>
          <Text style={{ color: Colors.lightGray, fontSize: 16 }}>{videoError}</Text>
        </View>
      )}
      {!videoLoading && !isMerging && !videoError && textOverlays.length > 0 && textOverlays.map((overlay: TextOverlay) => (
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
  );
};

// Reusable description preview component
const DescriptionPreview: React.FC<{
  description: string;
  formattedRichText: Array<{ text: string; isSemiBold: boolean }>;
  onPress: () => void;
}> = ({ description, formattedRichText, onPress }) => (
  <View style={[styles.descriptionSection, { paddingBottom: 0 }]}>
    <Text style={[styles.sectionHeaderTitle, { marginBottom: 4 }]}>Description</Text>
    <TouchableOpacity 
      onPress={onPress}
      activeOpacity={0.7}
      style={styles.descriptionInputTouchable}
    >
      {description ? (
        <Text style={styles.descriptionInputPreview} numberOfLines={3}>
          {formattedRichText.map((part, index) => (
            <Text key={index} style={part.isSemiBold ? styles.descriptionInputPreviewSemiBold : styles.descriptionInputPreviewNormal}>
              {part.text}
            </Text>
          ))}
        </Text>
      ) : (
        <Text style={[styles.descriptionInputPreview, styles.descriptionInputPlaceholder]}>
          Add text & tags (optional)
        </Text>
      )}
    </TouchableOpacity>
  </View>
);

// Reusable channel selector component
const ChannelSelector: React.FC<{
  selectedChannel: OrbytChannel | null;
  onPress: () => void;
  showRing?: boolean;
}> = ({ selectedChannel, onPress, showRing = false }) => (
  <View style={styles.section}>
    <Text style={styles.sectionHeaderTitle}>Channel (optional)</Text>
    <TouchableOpacity 
      style={styles.channelSelectorContainer}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.channelSelectorBox}>
        {!selectedChannel ? (
          <Avatar
            type="channel"
            size={52}
            ringColor={showRing ? undefined : "transparent"}
            fallbackIcon="device-tv"
            fallbackIconColor={Colors.lightGray}
            fallbackIconSize={32}
          />
        ) : (
          <Avatar
            uri={getChannelAvatarUri(selectedChannel.uri)}
            type="channel"
            size={52}
            ringColor={showRing ? undefined : "transparent"}
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
);

// Reusable comment filter selector component
const CommentFilterSelector: React.FC<{
  commentFilter: string | null;
  getSelectedCommentFilterLabel: () => string;
  onPress: () => void;
}> = ({ commentFilter, getSelectedCommentFilterLabel, onPress }) => (
  <View style={styles.section}>
    <Text style={styles.sectionHeaderTitle}>Comments</Text>
    <TouchableOpacity 
      style={styles.channelSelectorContainer}
      onPress={onPress}
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
);

// Reusable content warning selector component
const ContentWarningSelector: React.FC<{
  selectedContentWarnings: string[];
  otherWarning: string;
  getSelectedContentWarningsLabel: () => string;
  onPress: () => void;
}> = ({ selectedContentWarnings, otherWarning, getSelectedContentWarningsLabel, onPress }) => (
  <View style={styles.section}>
    <Text style={styles.sectionHeaderTitle}>Warnings</Text>
    <TouchableOpacity 
      style={styles.channelSelectorContainer}
      onPress={onPress}
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
);

// Reusable post button component
const PostButton: React.FC<{
  onPress: () => void;
  isPosting: boolean;
  isCompressing: boolean;
  uploadProgress: number;
  buttonStyle?: 'landscape' | 'portrait';
  width?: number;
}> = ({ onPress, isPosting, isCompressing, uploadProgress, buttonStyle = 'portrait', width }) => {
  const buttonWidth = width || SCREEN_WIDTH * 0.6;
  const glassStyle = buttonStyle === 'landscape' ? styles.landscapePostButtonGlass : styles.floatingPostButtonGlass;
  const hostStyle = buttonStyle === 'landscape' ? styles.landscapePostButtonHost : styles.floatingPostButtonHost;
  const disabledStyle = buttonStyle === 'landscape' ? styles.landscapePostButtonDisabled : styles.floatingPostButtonDisabled;

  return (
    <TouchableOpacity 
      onPress={onPress}
      disabled={isPosting || isCompressing}
      activeOpacity={0.8}
    >
      {Platform.OS === 'ios' && isLiquidGlassAvailable() ? (
        <GlassView
          style={[glassStyle, { width: buttonWidth }]}
          glassEffectStyle="clear"
          tintColor="rgba(255,255,255,0.9)"
          isInteractive
        >
          <View style={styles.buttonContent}>
            {isPosting ? (
              <View style={styles.loadingContainer}>
                <Loading3FillIcon size={24} color={Colors.black} />
                <Text style={styles.postButtonText}>
                  {uploadProgress < 50 ? 'Uploading video...' : 
                   uploadProgress < 90 ? 'Processing video...' : 
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
            hostStyle, 
            { width: buttonWidth }, 
            (isPosting || isCompressing) && disabledStyle
          ]}
        >
          <View style={styles.buttonContent}>
            {isPosting ? (
              <View style={styles.loadingContainer}>
                <Loading3FillIcon size={24} color={Colors.black} />
                <Text style={styles.postButtonText}>
                  {uploadProgress < 50 ? 'Uploading video...' : 
                   uploadProgress < 90 ? 'Processing video...' : 
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
  );
};

// Reusable description input modal component
const DescriptionInputModal: React.FC<{
  visible: boolean;
  description: string;
  formattedRichText: Array<{ text: string; isSemiBold: boolean }>;
  descriptionSelection: { start: number; end: number };
  setDescription: (text: string) => void;
  setDescriptionSelection: (selection: { start: number; end: number }) => void;
  onClose: () => void;
  richTextSearchModalProps: any;
  insets: { top: number };
}> = ({ visible, description, formattedRichText, descriptionSelection, setDescription, setDescriptionSelection, onClose, richTextSearchModalProps, insets }) => (
  <Modal
    visible={visible}
    transparent={true}
    animationType="fade"
    onRequestClose={onClose}
  >
    <View style={styles.descriptionModalContainer}>
      <View style={styles.descriptionModalOverlay}>
        <View style={[styles.descriptionModalContentWrapper, { paddingTop: insets.top }]}>
          <View style={styles.descriptionModalHeader}>
            <View style={styles.descriptionModalHeaderSpacer} />
            <Text style={[styles.sectionHeaderTitle, { marginBottom: 0 }]}>Description</Text>
            <TouchableOpacity 
              onPress={onClose}
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
            keyboardVerticalOffset={0}
          >
            <View style={styles.descriptionInputContainer}>
              <TextInput
                value={description}
                onChangeText={setDescription}
                onSelectionChange={(e) => {
                  setDescriptionSelection(e.nativeEvent.selection);
                }}
                style={styles.descriptionModalInput}
                placeholder="Add text & tags (optional)"
                placeholderTextColor={Colors.mediumGray}
                multiline={true}
                maxLength={300}
                autoFocus={true}
                textAlignVertical="top"
                blurOnSubmit={false}
                returnKeyType="default"
                selectionColor={Colors.lightGray}
                cursorColor={Colors.lightGray}
              />
              {description && (
                <View style={styles.descriptionInputOverlay} pointerEvents="none">
                  <Text style={styles.descriptionInputOverlayText}>
                    {formattedRichText.map((part, index) => (
                      <Text key={index} style={part.isSemiBold ? styles.descriptionInputOverlaySemiBold : styles.descriptionInputOverlayNormal}>
                        {part.text}
                      </Text>
                    ))}
                  </Text>
                </View>
              )}
            </View>
            {richTextSearchModalProps.visible && (
              <RichTextSearchModal
                {...richTextSearchModalProps}
                containerStyle={styles.searchModalContainer}
              />
            )}
          </KeyboardAvoidingView>
        </View>
      </View>
    </View>
  </Modal>
);

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
  
  // Draft store
  const { setDraft, clearDraft, getDraft } = useVideoPostDraftStore();
  
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
  const [isDownloading, setIsDownloading] = useState(false);

  // User store hooks
  const { currentUser } = useCurrentUser();
  
  // Fade-in animation for smooth screen entry
  const fadeOpacity = useSharedValue(0);
  const headerFadeOpacity = useSharedValue(0);
  
  useEffect(() => {
    // Fade in header buttons first, then content
    headerFadeOpacity.value = withTiming(1, {
      duration: 200,
      easing: Easing.out(Easing.ease),
    });
    // Fade in content slightly after header
    fadeOpacity.value = withTiming(1, {
      duration: 300,
      easing: Easing.out(Easing.ease),
    });
  }, []);
  
  const fadeAnimatedStyle = useAnimatedStyle(() => ({
    opacity: fadeOpacity.value,
  }));
  
  const headerFadeAnimatedStyle = useAnimatedStyle(() => ({
    opacity: headerFadeOpacity.value,
  }));
  
  // Rich text search hook for description input (for @ mentions and # hashtags)
  const {
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

  // Restore draft state when component mounts or videoPath changes
  useEffect(() => {
    if (videoPath) {
      const draft = getDraft();
      if (draft && draft.videoPath === videoPath) {
        // Restore draft state
        setDescription(draft.description || '');
        setSelectedContentWarnings(draft.selectedContentWarnings || []);
        setOtherWarning(draft.otherWarning || '');
        setCommentFilter(draft.commentFilter || null);
        setSelectedChannel(draft.selectedChannel || null);
      }
    }
  }, [videoPath, getDraft]);

  // Save draft state whenever it changes (with debouncing to prevent infinite loops)
  const prevDraftRef = useRef<string>('');
  useEffect(() => {
    if (!videoPath) return;
    
    const currentDraft = JSON.stringify({
      videoPath,
      segments: segmentsParam || null,
      thumbnailPath: thumbnailPath || null,
      textOverlays: textOverlays || [],
      description,
      selectedContentWarnings,
      otherWarning,
      commentFilter,
      selectedChannel,
    });
    
    // Only update if draft actually changed
    if (prevDraftRef.current !== currentDraft) {
      prevDraftRef.current = currentDraft;
      setDraft({
        videoPath,
        segments: segmentsParam || null,
        thumbnailPath: thumbnailPath || null,
        textOverlays: textOverlays || [],
        description,
        selectedContentWarnings,
        otherWarning,
        commentFilter,
        selectedChannel,
      });
    }
  }, [videoPath, segmentsParam, thumbnailPath, textOverlays, description, selectedContentWarnings, otherWarning, commentFilter, selectedChannel]);

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

  // Use RichText API hook for formatting
  const [richText] = useRichText(description);
  
  // Format rich text for display using RichText API
  const formattedRichText = formatRichTextForDisplay(richText);



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
      
      // Use compressed video if available, otherwise use the validated path
      const videoPathToUpload = compressedVideoPath || videoPathToUse;
      
      // Save video to gallery FIRST (before upload) so user has it even if upload fails
      try {
        // Request media library permissions
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status === 'granted') {
          // Resolve the video path to ensure it's accessible
          const pathInfo = await resolveVideoPath(videoPathToUpload);
          
          if (pathInfo.exists) {
            // Save video to media library silently (don't block post flow if this fails)
            await MediaLibrary.createAssetAsync(pathInfo.uri);
            
            logger.info('Video saved to gallery before posting', {
              component: 'VideoPostScreen',
            });
          }
        }
      } catch (saveError) {
        // Silently fail - don't interrupt the post flow if save fails
        logger.error('Failed to save video to gallery before posting', saveError, { 
          component: 'VideoPostScreen' 
        });
      }
      
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
      
      // Clear draft since post was successful
      clearDraft();
      
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
    navigation.back();
  };

  const handleDownload = async () => {
    if (!activeVideoPath || isDownloading || isMerging) {
      if (isMerging) {
        Alert.alert('Please wait', 'Video is still being merged. Please wait for it to complete.');
      }
      return;
    }

    try {
      setIsDownloading(true);

      // Request media library permissions
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please grant access to your photo library to save the video.',
          [{ text: 'OK' }]
        );
        setIsDownloading(false);
        return;
      }

      // Use compressed video if available, otherwise use the active video path
      const videoPathToDownload = compressedVideoPath || activeVideoPath;

      // Resolve the video path to ensure it's accessible
      const pathInfo = await resolveVideoPath(videoPathToDownload);
      
      if (!pathInfo.exists) {
        Alert.alert(
          'Video Not Found',
          'The video file could not be found. Please try again.',
          [{ text: 'OK' }]
        );
        setIsDownloading(false);
        return;
      }

      // Use the resolved URI (already has file:// prefix)
      const fileUri = pathInfo.uri;

      // Save video to media library
      const asset = await MediaLibrary.createAssetAsync(fileUri);
      
      Alert.alert(
        'Video Saved',
        'Your video has been saved to your photo library.',
        [{ text: 'OK' }]
      );

      logger.info('Video downloaded successfully', {
        component: 'VideoPostScreen',
        assetId: asset.id,
      });
    } catch (error: any) {
      logger.error('Failed to download video', error, { component: 'VideoPostScreen' });
      Alert.alert(
        'Download Failed',
        error.message || 'Failed to save video to your photo library. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsDownloading(false);
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

  // Reset selection when modal opens to fix cursor alignment
  useEffect(() => {
    if (showDescriptionInputModal) {
      setTimeout(() => {
        setDescriptionSelection({ start: description.length, end: description.length });
      }, 100);
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
  const isSmallDevice = isSmallScreen();

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
        <StatusBar hidden={true} />
        <LinearGradient
          colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.1)', 'transparent']}
          locations={[0, 0.7, 1]}
          style={[styles.statusBarGradient, { height: isSmallDevice ? 54 : insets.top + 60 }]}
          pointerEvents="none"
        />
        {/* Header */}
        <Animated.View 
          style={[
            styles.headerButton, 
            { 
              top: isSmallDevice ? 5 : insets.top + 4,
              left: 4,
            },
            headerFadeAnimatedStyle
          ]}
        >
          <TouchableOpacity 
            onPress={handleCancel}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            <BackArrowIcon size={32} color={Colors.white} />
          </TouchableOpacity>
        </Animated.View>
        <Animated.View 
          style={[
            styles.headerButton, 
            { 
              top: isSmallDevice ? 5 : insets.top + 4,
              right: 4,
              left: undefined,
            },
            headerFadeAnimatedStyle
          ]}
        >
          <TouchableOpacity 
            onPress={handleDownload}
            disabled={isDownloading || isMerging || !activeVideoPath}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            {isDownloading ? (
              <Loading3FillIcon size={32} color={Colors.white} />
            ) : (
              <Icon name="save" size={32} color={Colors.white} />
            )}
          </TouchableOpacity>
        </Animated.View>
        <Animated.View style={[styles.landscapeContainer, fadeAnimatedStyle]}>
          {/* Left: Info Side */}
          <View style={styles.landscapeInfoSide}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.landscapeInfoScroll, { paddingBottom: 40 }]}>
              <DescriptionPreview
                description={description}
                formattedRichText={formattedRichText}
                onPress={() => setShowDescriptionInputModal(true)}
              />
              <ChannelSelector
                selectedChannel={selectedChannel}
                onPress={() => setShowChannelSelectionSheet(true)}
              />
              <CommentFilterSelector
                commentFilter={commentFilter}
                getSelectedCommentFilterLabel={getSelectedCommentFilterLabel}
                onPress={() => setShowCommentSettingsSheet(true)}
              />
              <ContentWarningSelector
                selectedContentWarnings={selectedContentWarnings}
                otherWarning={otherWarning}
                getSelectedContentWarningsLabel={getSelectedContentWarningsLabel}
                onPress={() => setShowContentWarningsSheet(true)}
              />
              <View style={[styles.landscapePostButtonContainer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                <PostButton
                  onPress={handlePost}
                  isPosting={isPosting}
                  isCompressing={isCompressing}
                  uploadProgress={uploadProgress}
                  buttonStyle="landscape"
                  width={SCREEN_WIDTH * 0.6}
                />
              </View>
            </ScrollView>
          </View>
          {/* Right: Video Preview Side */}
          <View style={styles.landscapeVideoSide}>
            <View style={styles.previewSection}>
              <VideoPreviewContent
                thumbnailPath={thumbnailPath}
                videoUri={videoUri}
                player={player}
                videoLoading={videoLoading}
                isMerging={isMerging}
                videoError={videoError}
                textOverlays={textOverlays}
                containerStyle={{ width: '100%', aspectRatio: ASPECT_RATIO, maxHeight: '90%' }}
              />
            </View>
          </View>
        </Animated.View>

      </SafeAreaView>
    );
  }

  // ... existing portrait layout ...

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar hidden={true} />
      <LinearGradient
        colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.1)', 'transparent']}
        locations={[0, 0.7, 1]}
        style={[styles.statusBarGradient, { height: isSmallDevice ? 54 : insets.top + 60 }]}
        pointerEvents="none"
      />
      {/* Header */}
      <Animated.View 
        style={[
          styles.headerButton, 
          { 
            top: isSmallDevice ? 5 : insets.top + 4,
            left: 4,
          },
          headerFadeAnimatedStyle
        ]}
      >
        <TouchableOpacity 
          onPress={handleCancel}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        >
          <BackArrowIcon size={32} color={Colors.white} />
        </TouchableOpacity>
      </Animated.View>
      <Animated.View 
        style={[
          styles.headerButton, 
          { 
            top: isSmallDevice ? 5 : insets.top + 4,
            right: 4,
            left: undefined,
          },
          headerFadeAnimatedStyle
        ]}
      >
        <TouchableOpacity 
          onPress={handleDownload}
          disabled={isDownloading || isMerging || !activeVideoPath}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        >
          {isDownloading ? (
            <Loading3FillIcon size={32} color={Colors.white} />
          ) : (
            <Icon name="save" size={32} color={Colors.white} />
          )}
        </TouchableOpacity>
      </Animated.View>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <Animated.ScrollView 
          style={[styles.contentContainer, fadeAnimatedStyle]}
          contentContainerStyle={[
            { paddingBottom: 60 + Math.max(insets.bottom, 20) + 80 }
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Video Preview Section */}
          <View style={styles.previewSection}>
            <VideoPreviewContent
              thumbnailPath={thumbnailPath}
              videoUri={videoUri}
              player={player}
              videoLoading={videoLoading}
              isMerging={isMerging}
              videoError={videoError}
              textOverlays={textOverlays}
              containerStyle={{ width: containerWidth, height: containerHeight }}
            />
          </View>
          
          {/* Spacer to account for absolutely positioned preview */}
          <View style={{ height: containerHeight + 22 }} />
          
          <DescriptionPreview
            description={description}
            formattedRichText={formattedRichText}
            onPress={() => setShowDescriptionInputModal(true)}
          />
          
          {/* Divider */}
          <View style={styles.sectionDivider} />
          
          <ChannelSelector
            selectedChannel={selectedChannel}
            onPress={() => setShowChannelSelectionSheet(true)}
            showRing={false}
          />
          
          <CommentFilterSelector
            commentFilter={commentFilter}
            getSelectedCommentFilterLabel={getSelectedCommentFilterLabel}
            onPress={() => setShowCommentSettingsSheet(true)}
          />
          
          <ContentWarningSelector
            selectedContentWarnings={selectedContentWarnings}
            otherWarning={otherWarning}
            getSelectedContentWarningsLabel={getSelectedContentWarningsLabel}
            onPress={() => setShowContentWarningsSheet(true)}
          />
          
          
        </Animated.ScrollView>
        

        
        <View style={[styles.floatingPostButtonContainer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <PostButton
            onPress={handlePost}
            isPosting={isPosting}
            isCompressing={isCompressing}
            uploadProgress={uploadProgress}
            buttonStyle="portrait"
            width={SCREEN_WIDTH * 0.6}
          />
        </View>
      </KeyboardAvoidingView>

      {/* Description Input Modal */}
      <DescriptionInputModal
        visible={showDescriptionInputModal}
        description={description}
        formattedRichText={formattedRichText}
        descriptionSelection={descriptionSelection}
        setDescription={setDescription}
        setDescriptionSelection={setDescriptionSelection}
        onClose={() => setShowDescriptionInputModal(false)}
        richTextSearchModalProps={richTextSearchModalProps}
        insets={insets}
      />

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
    paddingHorizontal: 4,
  },
  headerTitle: {
    color: Colors.lightGray,
    fontSize: 18,
    fontFamily: 'Firma-SemiBold',
  },
  headerButton: {
    position: 'absolute',
    zIndex: 1000,
    padding: 8,
    borderRadius: BORDER_RADIUS.LARGE,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.overlayBlack50,
  },
  postButton: {
    backgroundColor: Colors.darkGray,
    paddingHorizontal: 15,
  },
  contentContainer: {
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
  poster: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  videoPlayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  loadingOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
    backgroundColor: 'transparent',
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
    paddingBottom: 0,
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
    paddingTop: 8,
    paddingBottom: 8,
  },
  sectionDivider: {
    height: 2,
    backgroundColor: Colors.darkGray,
    marginHorizontal: 15,
    marginVertical: 4,
  },
  sectionHeaderTitle: {
    color: Colors.lightGray,
    fontSize: 18,
    fontFamily: 'Firma-Bold',
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
    backgroundColor: Colors.lightGray,
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
    backgroundColor: Colors.lightGray,
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
    fontSize: 15,
    lineHeight: 22,
  },
  descriptionInputPreviewNormal: {
    color: Colors.lightGray,
    fontFamily: 'Firma-Regular',
    fontSize: 15,
    lineHeight: 22,
  },
  descriptionInputPreviewSemiBold: {
    color: Colors.lightGray,
    fontFamily: 'Firma-SemiBold',
    fontSize: 15,
    lineHeight: 22,
  },
  descriptionInputPlaceholder: {
    color: Colors.mediumGray,
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
    justifyContent: 'flex-start',
  },
  descriptionModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 15,
    paddingRight: 15,
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
    paddingVertical: 0,
    paddingLeft: 16,
    paddingRight: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  descriptionModalDoneText: {
    color: Colors.lightGray,
    fontSize: 18,
    fontFamily: 'Firma-Medium',
  },
  descriptionModalDoneTextDisabled: {
    color: Colors.red,
  },
  descriptionModalDoneButtonDisabled: {
    opacity: 0.5,
  },
  descriptionModalContent: {
    padding: 15,
    paddingTop: 4,
    flex: 1,
  },
  descriptionInputContainer: {
    position: 'relative',
    width: '100%',
  },
  descriptionModalInput: {
    color: 'transparent',
    fontFamily: 'Firma-Regular',
    fontSize: 15,
    textAlignVertical: 'top',
    includeFontPadding: false,
    paddingVertical: 0,
    paddingHorizontal: 0,
    width: '100%',
    minHeight: 24,
    maxHeight: 400,
  },
  descriptionInputOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  descriptionInputOverlayText: {
    color: Colors.lightGray,
    fontFamily: 'Firma-Regular',
    fontSize: 15,
    textAlignVertical: 'top',
    includeFontPadding: false,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  descriptionInputOverlayNormal: {
    color: Colors.lightGray,
    fontFamily: 'Firma-Regular',
    fontSize: 15,
  },
  descriptionInputOverlaySemiBold: {
    color: Colors.lightGray,
    fontFamily: 'Firma-SemiBold',
    fontSize: 15,
  },
  descriptionPreview: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
    paddingVertical: 0,
    paddingHorizontal: 0,
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
    fontSize: 16,
  },
  descriptionPreviewSemiBold: {
    color: Colors.lightGray,
    fontFamily: 'Firma-SemiBold',
    fontSize: 16,
  },
  searchResultsContainer: {
    flex: 1,
  },
  searchModalContainer: {
    flex: 1,
    marginTop: 8,
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