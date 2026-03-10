import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { BORDER_RADIUS, APP_CONSTANTS } from '../../src/utils/constants';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Platform,
  Dimensions,
  ScrollView,
  KeyboardAvoidingView,
  TextInput,
  Modal,
  StatusBar,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useVideoPlayer, VideoView, VideoPlayer } from 'expo-video';
import * as MediaLibrary from 'expo-media-library';
import { Image } from 'expo-image';
import { BlurView } from '../../src/components/ui/BlurView';
import { useRouter, useFocusEffect } from 'expo-router';
import { Avatar } from '../../src/components/ui/UI';
import Icon, { BackArrowIcon, DownSmallFillIcon } from '../../src/components/ui/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TextOverlay } from '../../src/types';
import { resolveVideoPath, VideoPathInfo } from '../../src/utils/video/path';
import { DEFAULT_BUFFER_OPTIONS, DEFAULT_VIDEO_ASPECT_RATIO } from '../../src/utils/video/helpers';
import { Colors } from '../../src/theme';
import { Typography } from '../../src/utils/components/typography';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import { useCurrentUser } from '../../src/stores/userStore';
import ProfileService from '../../src/services/data/ProfileService';
import AtprotoService from '../../src/services/api/AtprotoService';
import VideoProcessingService from '../../src/services/video/VideoProcessingService';
import { logger } from '../../src/utils/logger';
import { useVideoPostDraftStore } from '../../src/stores/videoPostDraftStore';
import { usePendingVideoPostStore } from '../../src/stores/pendingVideoPostStore';
import {
  getPostableChannels,
  shouldShowChannelSlash,
  OrbytChannel,
  extractFeedSlug,
  getChannelAvatarUri,
  getChannelByUri,
} from '../../src/utils/channels/orbyt';
import type { SubscribedChannel } from '../../src/stores/userStore';
import VerticalListSheet, {
  VerticalListButton,
  TrueSheet,
} from '../../src/components/ui/VerticalListSheet';
import { useRichTextSearchTrigger, RichTextSearchModal } from '../../src/components/ui/usersearch';
import { useRichText, formatRichTextForDisplay } from '../../src/hooks/useRichText';

const VIDEO_WIDTH = 150; // Fixed preview width

// Convert OrbytChannel to SubscribedChannel for draft storage
function orbytChannelToSubscribedChannel(channel: OrbytChannel): SubscribedChannel {
  return {
    uri: channel.uri,
    displayName: channel.displayName,
    description: channel.description,
    avatar: undefined, // OrbytChannel doesn't have avatar, will be resolved via getChannelAvatarUri
    isOrbytChannel: true,
    subscribedAt: Date.now(),
  };
}

// Reusable video preview component to avoid duplication
const VideoPreviewContent: React.FC<{
  thumbnailPath?: string;
  videoUri: string;
  player: VideoPlayer | null;
  videoLoading: boolean;
  isMerging: boolean;
  videoError: string | null;
  textOverlays: TextOverlay[];
  containerStyle?: import('react-native').ViewStyle;
}> = ({
  thumbnailPath,
  videoUri,
  player,
  videoLoading,
  isMerging,
  videoError,
  textOverlays,
  containerStyle,
}) => {
  const thumbnailUrl = thumbnailPath || videoUri;

  return (
    <View style={[styles.videoContainer, containerStyle]}>
      {thumbnailUrl && (
        <>
          <Image source={{ uri: thumbnailUrl }} contentFit="cover" style={styles.poster} />
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
        </>
      )}
      {videoUri && player && (
        <VideoView
          player={player}
          style={styles.videoPlayer}
          contentFit="contain"
          nativeControls={false}
          surfaceType={Platform.OS === 'android' ? 'textureView' : undefined}
        />
      )}
      {(videoLoading || isMerging) && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.neutral[50]} />
        </View>
      )}
      {videoError && (
        <View style={[styles.loadingOverlay, styles.errorOverlay]}>
          <Text style={styles.errorText}>{videoError}</Text>
        </View>
      )}
      {!videoLoading &&
        !isMerging &&
        !videoError &&
        textOverlays.length > 0 &&
        textOverlays.map((overlay: TextOverlay) => (
          <View
            key={overlay.id}
            style={[
              styles.textOverlayContainer,
              {
                left: overlay.position.x,
                top: overlay.position.y,
                transform: [
                  { scaleX: overlay.scale ?? 1 },
                  { scaleY: overlay.scale ?? 1 },
                ] as Array<{ scaleX: number } | { scaleY: number }>,
              },
            ]}
          >
            <Text
              style={[
                styles.textOverlay,
                {
                  fontFamily: overlay.fontFamily,
                  color: overlay.color,
                },
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
  formattedRichText: Array<{ text: string; isSemiBold: boolean; isSymbol?: boolean }>;
  onPress: () => void;
}> = ({ description, formattedRichText, onPress }) => (
  <View style={[styles.descriptionSection, styles.descriptionSectionNoPadding]}>
    <Text style={[styles.sectionHeaderTitle, styles.sectionHeaderTitleSmall]}>Description</Text>
    <Pressable onPress={onPress} style={styles.descriptionInputTouchable}>
      {description ? (
        <Text style={styles.descriptionInputPreview} numberOfLines={3}>
          {formattedRichText.map((part, index) => (
            <Text
              key={index}
              style={
                part.isSymbol
                  ? styles.descriptionInputPreviewMedium
                  : part.isSemiBold
                    ? styles.descriptionInputPreviewSemiBold
                    : styles.descriptionInputPreviewNormal
              }
            >
              {part.text}
            </Text>
          ))}
        </Text>
      ) : (
        <Text style={[styles.descriptionInputPreview, styles.descriptionInputPlaceholder]}>
          Add text & tags (optional)
        </Text>
      )}
    </Pressable>
  </View>
);

// Reusable channel selector component
const ChannelSelector: React.FC<{
  selectedChannel: SubscribedChannel | null;
  onPress: () => void;
  showRing?: boolean;
}> = ({ selectedChannel, onPress, showRing = false }) => (
  <View style={styles.section}>
    <Text style={styles.sectionHeaderTitle}>Channel (optional)</Text>
    <Pressable style={styles.channelSelectorContainer} onPress={onPress}>
      <View style={styles.channelSelectorBox}>
        {!selectedChannel ? (
          <Avatar
            type="channel"
            size={52}
            ringColor={showRing ? undefined : 'transparent'}
            fallbackIcon="device-tv"
            fallbackIconColor={Colors.neutral[200]}
            fallbackIconSize={32}
          />
        ) : (
          <Avatar
            uri={getChannelAvatarUri(selectedChannel.uri)}
            type="channel"
            size={52}
            ringColor={showRing ? undefined : 'transparent'}
          />
        )}
      </View>
      {!selectedChannel ? (
        <View style={styles.channelSelectorPlaceholderContainer}>
          <Text style={styles.channelSelectorPlaceholderText}>Pick a channel</Text>
          <DownSmallFillIcon size={20} color={Colors.neutral[500]} />
        </View>
      ) : (
        <View style={styles.channelSelectorNameContainer}>
          {(() => {
            const orbytChannel = getChannelByUri(selectedChannel.uri);
            return (
              shouldShowChannelSlash(selectedChannel.uri) && (
                <Text
                  style={[
                    styles.channelSelectorName,
                    styles.orbytSlash,
                    styles.channelSelectorNameSemiBold,
                    {
                      color: orbytChannel?.channelColor || Colors.amber[400],
                    },
                  ]}
                >
                  /
                </Text>
              )
            );
          })()}
          <Text style={[styles.channelSelectorName, styles.channelSelectorNameBold]}>
            {selectedChannel.displayName.toLowerCase()}
          </Text>
        </View>
      )}
    </Pressable>
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
    <Pressable style={styles.channelSelectorContainer} onPress={onPress}>
      <View style={styles.channelSelectorBox}>
        <Icon name="chat-3-line" size={32} color={Colors.neutral[200]} />
      </View>
      {!commentFilter ? (
        <View style={styles.channelSelectorPlaceholderContainer}>
          <Text style={styles.channelSelectorPlaceholderText}>
            {getSelectedCommentFilterLabel()}
          </Text>
          <DownSmallFillIcon size={20} color={Colors.neutral[500]} />
        </View>
      ) : (
        <View style={styles.channelSelectorNameContainer}>
          <Text style={styles.channelSelectorName}>{getSelectedCommentFilterLabel()}</Text>
        </View>
      )}
    </Pressable>
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
    <Pressable style={styles.channelSelectorContainer} onPress={onPress}>
      <View style={styles.channelSelectorBox}>
        <Icon name="warning-line" size={32} color={Colors.neutral[200]} />
      </View>
      {selectedContentWarnings.length === 0 && !otherWarning.trim() ? (
        <View style={styles.channelSelectorPlaceholderContainer}>
          <Text style={styles.channelSelectorPlaceholderText}>
            {getSelectedContentWarningsLabel()}
          </Text>
          <DownSmallFillIcon size={20} color={Colors.neutral[500]} />
        </View>
      ) : (
        <View style={styles.channelSelectorNameContainer}>
          <Text style={styles.channelSelectorName}>{getSelectedContentWarningsLabel()}</Text>
        </View>
      )}
    </Pressable>
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
  screenWidth?: number;
}> = ({
  onPress,
  isPosting,
  isCompressing,
  uploadProgress,
  buttonStyle = 'portrait',
  width,
  screenWidth,
}) => {
  const numericWidth =
    buttonStyle === 'portrait' ? Math.max(width ?? (screenWidth ?? 0) * 0.6, 200) : undefined;
  const buttonWidth = buttonStyle === 'landscape' ? '100%' : numericWidth;
  const glassStyle =
    buttonStyle === 'landscape' ? styles.landscapePostButtonGlass : styles.floatingPostButtonGlass;
  const hostStyle =
    buttonStyle === 'landscape' ? styles.landscapePostButtonHost : styles.floatingPostButtonHost;
  const disabledStyle =
    buttonStyle === 'landscape'
      ? styles.landscapePostButtonDisabled
      : styles.floatingPostButtonDisabled;

  const buttonContent = (
    <View style={styles.buttonContent} pointerEvents="none">
      {isPosting ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={Colors.black} />
          <Text style={styles.postButtonText}>
            {uploadProgress < 50
              ? 'Uploading video...'
              : uploadProgress < 90
                ? 'Processing video...'
                : 'Creating post...'}
          </Text>
        </View>
      ) : isCompressing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={Colors.black} />
          <Text style={styles.postButtonText}>Getting ready...</Text>
        </View>
      ) : (
        <Text style={styles.postButtonText}>POST</Text>
      )}
    </View>
  );

  return (
    <Pressable
      style={[
        glassStyle,
        { width: buttonWidth },
        !(Platform.OS === 'ios' && isLiquidGlassAvailable()) && hostStyle,
        (isPosting || isCompressing) && disabledStyle,
      ]}
      onPress={onPress}
      disabled={isPosting || isCompressing}
    >
      {Platform.OS === 'ios' && isLiquidGlassAvailable() ? (
        <>
          <GlassView
            style={styles.glassBackground}
            glassEffectStyle="clear"
            tintColor="rgba(255,255,255,0.9)"
            isInteractive
          />
          {buttonContent}
        </>
      ) : (
        buttonContent
      )}
    </Pressable>
  );
};

// Reusable description input modal component
const DescriptionInputModal: React.FC<{
  visible: boolean;
  description: string;
  formattedRichText: Array<{ text: string; isSemiBold: boolean; isSymbol?: boolean }>;
  setDescription: (text: string) => void;
  setDescriptionSelection: (selection: { start: number; end: number }) => void;
  onClose: () => void;
  richTextSearchModalProps: {
    visible: boolean;
    onSelectUser?: (user: {
      did: string;
      handle: string;
      displayName?: string;
      avatar?: string;
    }) => void;
    onSelectHashtag?: (hashtag: string) => void;
    onRequestClose: () => void;
    searchQuery: string;
    searchType: 'mention' | 'hashtag';
    anchorPosition?: { x: number; y: number };
    containerStyle?: import('react-native').ViewStyle;
  };
  insets: { top: number };
}> = ({
  visible,
  description,
  formattedRichText,
  setDescription,
  setDescriptionSelection,
  onClose,
  richTextSearchModalProps,
  insets,
}) => (
  <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
    <View style={styles.descriptionModalContainer}>
      <View style={styles.descriptionModalOverlay}>
        <View style={[styles.descriptionModalContentWrapper, { paddingTop: insets.top }]}>
          {/* Dynamic paddingTop based on safe area insets */}
          <View style={styles.descriptionModalHeader}>
            <View style={styles.descriptionModalHeaderSpacer} />
            <Text style={[styles.sectionHeaderTitle, styles.descriptionModalHeaderTitle]}>
              Description
            </Text>
            <Pressable
              onPress={onClose}
              style={[
                styles.descriptionModalDoneButton,
                description.length > 300 && styles.descriptionModalDoneButtonDisabled,
              ]}
              disabled={description.length > 300}
              accessibilityLabel={description.length > 300 ? 'Description too long' : 'Done'}
            >
              <Text
                style={[
                  styles.descriptionModalDoneText,
                  description.length > 300 && styles.descriptionModalDoneTextDisabled,
                ]}
              >
                {description.length > 300 ? `+${description.length - 300}` : 'Done'}
              </Text>
            </Pressable>
          </View>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.descriptionModalContent}
            keyboardVerticalOffset={0}
          >
            <View style={styles.descriptionInputContainer}>
              <TextInput
                nativeID="video-post-description-input"
                value={description}
                onChangeText={setDescription}
                onSelectionChange={e => {
                  setDescriptionSelection(e.nativeEvent.selection);
                }}
                style={styles.descriptionModalInput}
                placeholder="Add text & tags (optional)"
                placeholderTextColor={Colors.neutral[600]}
                multiline={true}
                maxLength={300}
                autoFocus={true}
                textAlignVertical="top"
                blurOnSubmit={false}
                returnKeyType="default"
                selectionColor={Colors.neutral[200]}
                cursorColor={Colors.neutral[200]}
                autoComplete="off"
                textContentType="none"
                importantForAutofill="no"
                caretHidden={false}
              />
              {description && (
                <View style={styles.descriptionInputOverlay} pointerEvents="none">
                  <Text style={styles.descriptionInputOverlayText}>
                    {formattedRichText.map((part, index) => (
                      <Text
                        key={index}
                        style={
                          part.isSemiBold
                            ? styles.descriptionInputOverlaySemiBold
                            : styles.descriptionInputOverlayNormal
                        }
                      >
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
  const consumePayload = usePendingVideoPostStore(s => s.consumePayload);
  const [payload] = useState(() => consumePayload());

  const videoPath = payload?.videoPath;
  const segments = useMemo(() => payload?.segments ?? [], [payload?.segments]);
  const segmentsForDraft = segments.length > 0 ? JSON.stringify(segments) : null;

  const [thumbnailPath, setThumbnailPath] = useState<string | undefined>(
    payload?.thumbnailPath ?? undefined
  );

  const textOverlays = useMemo(
    () => (payload?.textOverlays ?? []) as TextOverlay[],
    [payload?.textOverlays]
  );
  const router = useRouter();

  // Draft store
  const { setDraft, clearDraft, getDraft } = useVideoPostDraftStore();

  const [description, setDescription] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const playerRef = useRef<VideoPlayer | null>(null);

  // Background merging state
  const [isMerging, setIsMerging] = useState(false);
  const [mergedVideoPath, setMergedVideoPath] = useState<string | null>(null);

  // Content warning state
  const [selectedContentWarnings, setSelectedContentWarnings] = useState<string[]>([]);
  const [otherWarning, setOtherWarning] = useState('');
  const [showContentWarningInput, setShowContentWarningInput] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // Comment filtering state
  const [commentFilter, setCommentFilter] = useState<string | null>(null);

  // Channel selection state
  const [selectedChannel, setSelectedChannel] = useState<SubscribedChannel | null>(null);

  // Full-screen description input modal state
  const [showDescriptionInputModal, setShowDescriptionInputModal] = useState(false);
  const [videoLoading, setVideoLoading] = useState(true);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Rich text search state (for @ mentions and # hashtags)
  const [descriptionSelection, setDescriptionSelection] = useState({ start: 0, end: 0 });

  // Compression state
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressedVideoPath, setCompressedVideoPath] = useState<string | null>(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fadeAnimatedStyle = useAnimatedStyle(() => ({
    opacity: fadeOpacity.value,
  }));

  const headerFadeAnimatedStyle = useAnimatedStyle(() => ({
    opacity: headerFadeOpacity.value,
  }));

  // Rich text search hook for description input (for @ mentions and # hashtags)
  const { richTextSearchModalProps } = useRichTextSearchTrigger({
    value: description,
    selection: descriptionSelection,
    onChangeText: setDescription,
    onSelectionChange: e => {
      setDescriptionSelection(e.nativeEvent.selection);
    },
  });

  useEffect(() => {
    // Set current user handle in ProfileCache when userStore changes
    if (currentUser?.handle) {
      ProfileService.setCurrentUserHandle(currentUser.handle);
    }
  }, [currentUser?.handle, currentUser?.did]);

  const activeVideoPath = mergedVideoPath || videoPath;

  // Restore draft state when component mounts or videoPath changes
  useEffect(() => {
    if (activeVideoPath) {
      const draft = getDraft();
      if (draft && draft.videoPath === activeVideoPath) {
        setDescription(draft.description || '');
        setSelectedContentWarnings(draft.selectedContentWarnings || []);
        setOtherWarning(draft.otherWarning || '');
        setCommentFilter(draft.commentFilter || null);
        setSelectedChannel(draft.selectedChannel || null);
        if (draft.thumbnailPath) setThumbnailPath(draft.thumbnailPath);
      }
    }
  }, [
    activeVideoPath,
    getDraft,
    setThumbnailPath,
    setDescription,
    setSelectedContentWarnings,
    setOtherWarning,
    setCommentFilter,
    setSelectedChannel,
  ]);

  // Save draft state whenever it changes (with debouncing to prevent infinite loops)
  const prevDraftRef = useRef<string>('');
  useEffect(() => {
    if (!activeVideoPath) return;

    const currentDraft = JSON.stringify({
      videoPath: activeVideoPath,
      segments: segmentsForDraft,
      thumbnailPath: thumbnailPath || null,
      textOverlays: textOverlays || [],
      description,
      selectedContentWarnings,
      otherWarning,
      commentFilter,
      selectedChannel,
    });

    if (prevDraftRef.current !== currentDraft) {
      prevDraftRef.current = currentDraft;
      setDraft({
        videoPath: activeVideoPath,
        segments: segmentsForDraft,
        thumbnailPath: thumbnailPath || null,
        textOverlays: textOverlays || [],
        description,
        selectedContentWarnings,
        otherWarning,
        commentFilter,
        selectedChannel,
      });
    }
  }, [
    activeVideoPath,
    segmentsForDraft,
    thumbnailPath,
    textOverlays,
    description,
    selectedContentWarnings,
    otherWarning,
    commentFilter,
    selectedChannel,
    setDraft,
  ]);

  // Handle background merging when segments are provided
  useEffect(() => {
    if (segments.length === 0 || mergedVideoPath) return;

    const ac = new AbortController();
    const mergeSegments = async () => {
      try {
        if (ac.signal.aborted) return;
        setIsMerging(true);

        const processingSegments = segments.map(seg => ({
          startTime: seg.startTime,
          duration: seg.duration,
          video: seg.video as { uri: string } | { uri: string; [key: string]: unknown },
          sourceType: seg.sourceType as 'camera' | 'gallery' | undefined,
        }));

        const mergedVideo = await VideoProcessingService.mergeSegments(
          processingSegments as Parameters<typeof VideoProcessingService.mergeSegments>[0]
        );

        if (ac.signal.aborted) return;
        setMergedVideoPath(mergedVideo.path);
        setIsMerging(false);

        logger.info('Background merging completed', {
          component: 'VideoPostScreen',
          mergedPath: mergedVideo.path,
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Background merging failed', error, { component: 'VideoPostScreen' });
        if (ac.signal.aborted) return;
        setIsMerging(false);
        Alert.alert(
          'Merging Failed',
          errorMessage || 'Failed to merge video segments. Please try again.',
          [
            {
              text: 'Go Back',
              onPress: () => router.back(),
            },
          ]
        );
      }
    };

    mergeSegments();
    return () => ac.abort();
  }, [segments, mergedVideoPath, router]);

  // No valid video source
  const hasVideoSource = Boolean(videoPath || segments.length > 0);
  useEffect(() => {
    if (!hasVideoSource) {
      setVideoLoading(false);
      setVideoError('No video');
    }
  }, [hasVideoSource]);

  // Automatically check upload limits and compress video if needed on component mount
  // Defer compression until after interactions complete to avoid blocking UI
  useEffect(() => {
    if (!activeVideoPath) return;

    const ac = new AbortController();
    const interactionId = requestIdleCallback(
      async () => {
        try {
          if (ac.signal.aborted) return;
          setIsCompressing(true);

          const result = await VideoProcessingService.checkAndCompressVideoForUpload(
            activeVideoPath,
            undefined,
            () => {}
          );

          if (ac.signal.aborted) return;
          if (result.wasCompressed) {
            setCompressedVideoPath(result.processedVideo.path);
            logger.info('Video automatically compressed', {
              component: 'VideoPostScreen',
              originalSize: result.originalSize,
              compressedSize: result.compressedSize,
              reduction: `${((1 - result.compressedSize / result.originalSize) * 100).toFixed(1)}%`,
            });
          }
        } catch (error) {
          logger.error('Error checking and compressing video', error, {
            component: 'VideoPostScreen',
          });
        } finally {
          if (!ac.signal.aborted) setIsCompressing(false);
        }
      },
      { timeout: APP_CONSTANTS.IDLE_CALLBACK_TIMEOUT }
    );

    return () => {
      ac.abort();
      cancelIdleCallback(interactionId);
    };
  }, [activeVideoPath]);

  // removed legacy expo-av handlers (not used with expo-video)

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

    // Collect all content warnings, including custom one if present (before try block for error handling)
    const allContentWarnings = [...selectedContentWarnings];
    if (otherWarning.trim()) {
      allContentWarnings.push('other:' + otherWarning.trim());
    }

    try {
      setIsPosting(true);
      setUploadProgress(0);

      // Use compressed video if available, otherwise use the validated path
      const videoPathToUpload = compressedVideoPath || videoPathToUse;

      // Save video to gallery FIRST (before upload) so user has it even if upload fails
      try {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status === 'granted') {
          const pathInfo = await resolveVideoPath(videoPathToUpload);
          if (pathInfo.exists) {
            await MediaLibrary.createAssetAsync(pathInfo.uri);
            logger.info('Video saved to gallery before posting', {
              component: 'VideoPostScreen',
            });
          }
        }
      } catch (saveError) {
        logger.error('Failed to save video to gallery before posting', saveError, {
          component: 'VideoPostScreen',
        });
      }

      logger.info('Preparing video post', {
        component: 'VideoPostScreen',
        videoPath: videoPathToUpload?.substring(0, 50) + '...',
        descriptionLength: description?.length || 0,
        selectedContentWarnings,
        allContentWarnings,
        otherWarning: otherWarning.trim() || null,
        commentFilter,
        selectedChannel: selectedChannel
          ? { uri: selectedChannel.uri, slug: extractFeedSlug(selectedChannel.uri) || undefined }
          : null,
      });

      const { useUIStore } = await import('../../src/stores/uiStore');
      const { storage } = await import('../../src/utils/storage/storage');
      const UPLOAD_KEY = 'video-upload';
      useUIStore.getState().setLoading(UPLOAD_KEY, true);

      const channelSlug = selectedChannel
        ? extractFeedSlug(selectedChannel.uri) || undefined
        : undefined;

      const { VideoService } = await import('../../src/services/api/video/VideoService');

      const uploadResult = await VideoService.uploadVideo(videoPathToUpload, progress => {
        useUIStore.getState().setProgress(UPLOAD_KEY, progress);
        setUploadProgress(progress);
      });

      const postMetadata = {
        description,
        videoPath: videoPathToUpload,
        contentWarnings: allContentWarnings.length > 0 ? allContentWarnings : undefined,
        commentFilter: (commentFilter || 'all') as 'all' | 'followers' | 'mentioned' | 'none',
        channelSlug,
      };

      // Use thumbnail from params (passed from create) or extract for upload banner
      const bannerThumbnail =
        thumbnailPath ??
        (await VideoProcessingService.extractFirstFrame(videoPathToUpload).catch(() => null));
      if (bannerThumbnail) {
        storage.set('video-upload-thumbnail', bannerThumbnail);
      }

      router.replace('/(tabs)');

      (async () => {
        try {
          const processedBlob = await VideoService.waitForJob(uploadResult.jobId, progress => {
            useUIStore.getState().setProgress(UPLOAD_KEY, progress);
          });

          const result = await AtprotoService.createVideoPost(
            postMetadata.description,
            postMetadata.videoPath,
            postMetadata.contentWarnings,
            postMetadata.commentFilter,
            postMetadata.channelSlug,
            progress => {
              useUIStore.getState().setProgress(UPLOAD_KEY, progress);
            },
            uploadResult.jobId,
            processedBlob
          );

          logger.info('Video post created successfully', {
            component: 'VideoPostScreen',
            uri: result?.uri,
            cid: result?.cid,
          });

          setTimeout(() => {
            useUIStore.getState().setLoading(UPLOAD_KEY, false);
            useUIStore.getState().clearProgress(UPLOAD_KEY);
            storage.delete('video-upload-thumbnail');
          }, 10000);

          clearDraft();
        } catch (error: unknown) {
          logger.error('Background video post upload failed', error, {
            component: 'VideoPostScreen',
          });

          useUIStore.getState().setLoading(UPLOAD_KEY, false);
          useUIStore.getState().clearProgress(UPLOAD_KEY);
          storage.delete('video-upload-thumbnail');

          Alert.alert('Upload Failed', 'Your video upload failed. Please try again.', [
            { text: 'OK' },
          ]);
        } finally {
          setIsPosting(false);
          setUploadProgress(0);
        }
      })();
    } catch (error: unknown) {
      const errorObj = error as {
        message?: string;
        stack?: string;
        name?: string;
        response?: unknown;
        data?: unknown;
      };
      logger.error('Video post upload failed', error, {
        component: 'VideoPostScreen',
        errorMessage: errorObj?.message,
        errorStack: errorObj?.stack,
        errorName: errorObj?.name,
        errorResponse: errorObj?.response,
        errorData: errorObj?.data,
        selectedContentWarnings,
        allContentWarnings,
        otherWarning: otherWarning.trim() || null,
      });

      const errorMessage = error instanceof Error ? error.message : '';
      // For upload failures, assume issue and offer retry
      if (errorMessage?.includes('Video upload failed') || errorMessage?.includes('timeout')) {
        Alert.alert(
          'Upload Failed',
          'It looks like there was an issue while uploading your video.\n\nWould you like to try again?',
          [
            {
              text: 'Close',
              style: 'cancel',
            },
            {
              text: 'Retry',
              onPress: () => {
                // Retry the upload
                handlePost();
              },
            },
          ]
        );
      } else if (errorMessage?.includes('unauthorized')) {
        Alert.alert(
          'Authentication Failed',
          'Your session has expired. Please log out and log back in.',
          [{ text: 'OK' }]
        );
      } else if (errorMessage?.includes('Video compression failed')) {
        Alert.alert(
          'Compression Failed',
          'Failed to compress your video. Please try again with a shorter video or check your device storage.',
          [{ text: 'OK' }]
        );
      } else {
        // Generic error - still offer retry
        Alert.alert(
          'Upload Failed',
          `Unable to upload your video. It looks like there was an issue.\n\nWould you like to try again?`,
          [
            {
              text: 'Close',
              style: 'cancel',
            },
            {
              text: 'Retry',
              onPress: () => {
                // Retry the upload
                handlePost();
              },
            },
          ]
        );
      }
    } finally {
      setIsPosting(false);
      setUploadProgress(0);
    }
  };

  const handleCancel = () => {
    router.back();
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
        Alert.alert('Video Not Found', 'The video file could not be found. Please try again.', [
          { text: 'OK' },
        ]);
        setIsDownloading(false);
        return;
      }

      // Use the resolved URI (already has file:// prefix)
      const fileUri = pathInfo.uri;

      // Save video to media library
      const asset = await MediaLibrary.createAssetAsync(fileUri);

      Alert.alert('Video Saved', 'Your video has been saved to your photo library.', [
        { text: 'OK' },
      ]);

      logger.info('Video downloaded successfully', {
        component: 'VideoPostScreen',
        assetId: asset.id,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to download video', error, { component: 'VideoPostScreen' });
      Alert.alert(
        'Download Failed',
        errorMessage || 'Failed to save video to your photo library. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsDownloading(false);
    }
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
    if (isMerging || !activeVideoPath) {
      if (isMerging) {
        setVideoLoading(true);
        setVideoError(null);
      }
      return;
    }

    const ac = new AbortController();
    const resolveVideo = async () => {
      try {
        setVideoLoading(true);
        setVideoError(null);

        const pathInfo = await resolveVideoPath(activeVideoPath);

        if (ac.signal.aborted) return;
        setVideoPathInfo(pathInfo);

        if (!pathInfo.exists) {
          setVideoError('Video file not found');
        }
      } catch (error) {
        logger.error('Error resolving video path', error, { component: 'VideoPostScreen' });
        if (!ac.signal.aborted) setVideoError('Unable to access video file');
      } finally {
        if (!ac.signal.aborted) setVideoLoading(false);
      }
    };

    resolveVideo();
    return () => ac.abort();
  }, [activeVideoPath, isMerging]);

  // Final video URI for playback
  const videoUri = videoPathInfo?.uri || '';

  // Simple video player - auto-plays when source is set
  const player = useVideoPlayer(videoUri ? { uri: videoUri } : null, p => {
    p.loop = true;
    p.volume = 1;
    p.bufferOptions = DEFAULT_BUFFER_OPTIONS;
    playerRef.current = p;
  });

  // Update source and play when videoUri changes
  useEffect(() => {
    if (!player || !videoUri) return;
    player.replaceAsync({ uri: videoUri }).then(() => {
      player.play();
    });
  }, [player, videoUri]);

  // Sync play/pause state
  useEffect(() => {
    if (!player) return;
    if (isPlaying) {
      player.play();
    } else {
      player.pause();
    }
  }, [player, isPlaying]);

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
  }, [showDescriptionInputModal, description.length]);

  // Fixed container size with 9:16 aspect ratio
  const containerWidth = VIDEO_WIDTH;
  const containerHeight = containerWidth / DEFAULT_VIDEO_ASPECT_RATIO;

  // Add orientation state
  const getOrientation = () => {
    const { width, height } = Dimensions.get('window');
    return width > height ? 'landscape' : 'portrait';
  };

  const [orientation, setOrientation] = useState(getOrientation());
  const insets = useSafeAreaInsets();
  const { screenWidth, isTablet, isSmallPhone: isSmallDevice } = useDeviceLayout();

  useEffect(() => {
    const onChange = ({ window }: { window: { width: number; height: number } }) => {
      const { width, height } = window;
      setOrientation(width > height ? 'landscape' : 'portrait');
    };
    const sub = Dimensions.addEventListener('change', onChange);
    return () => sub?.remove();
  }, []);

  // Memoize dynamic header styles to avoid inline style warnings
  const headerButtonTopStyle = useMemo(
    () => ({ top: isSmallDevice ? 5 : insets.top + 4 }),
    [isSmallDevice, insets.top]
  );

  // Render header (StatusBar transparent, header buttons keep safe area) - shared between portrait and landscape
  const renderHeader = () => (
    <>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <Animated.View
        style={[
          styles.headerButton,
          styles.headerButtonLeft,
          headerButtonTopStyle,
          headerFadeAnimatedStyle,
        ]}
      >
        <Pressable onPress={handleCancel} style={styles.headerButtonCenter}>
          <BackArrowIcon size={32} color={Colors.neutral[50]} />
        </Pressable>
      </Animated.View>
      <Animated.View
        style={[
          styles.headerButton,
          styles.headerButtonRight,
          headerButtonTopStyle,
          headerFadeAnimatedStyle,
        ]}
      >
        <Pressable
          onPress={handleDownload}
          disabled={isDownloading || isMerging || !activeVideoPath}
          style={styles.headerButtonCenter}
        >
          {isDownloading ? (
            <ActivityIndicator size="large" color={Colors.neutral[50]} />
          ) : (
            <Icon name="save" size={32} color={Colors.neutral[50]} />
          )}
        </Pressable>
      </Animated.View>
    </>
  );

  // Render all modals/sheets - shared between portrait and landscape
  const renderModals = () => (
    <>
      <DescriptionInputModal
        visible={showDescriptionInputModal}
        description={description}
        formattedRichText={formattedRichText}
        setDescription={setDescription}
        setDescriptionSelection={setDescriptionSelection}
        onClose={() => setShowDescriptionInputModal(false)}
        richTextSearchModalProps={richTextSearchModalProps}
        insets={insets}
      />

      <VerticalListSheet
        name="post-content-warnings-sheet"
        onDismiss={() => {}}
        title="Warnings"
        scrollable={false}
        showCancelButton={true}
        cancelButtonText="Close"
      >
        <View style={styles.sheetContent}>
          {CONTENT_WARNINGS.map(warning => (
            <Pressable
              key={warning.id}
              style={styles.sheetOptionRow}
              onPress={() => toggleContentWarning(warning.id)}
            >
              <Text style={styles.sheetOptionText}>{warning.label.toLowerCase()}</Text>
              <View
                style={[
                  styles.checkbox,
                  selectedContentWarnings.includes(warning.id) && styles.checkboxSelected,
                ]}
              >
                {selectedContentWarnings.includes(warning.id) && (
                  <Icon name="checkmark" size={16} color={Colors.black} />
                )}
              </View>
            </Pressable>
          ))}
          <Pressable
            style={styles.sheetOptionRow}
            onPress={() => setShowContentWarningInput(!showContentWarningInput)}
          >
            <Text style={styles.sheetOptionText}>other warning</Text>
            <View style={[styles.checkbox, showContentWarningInput && styles.checkboxSelected]}>
              {showContentWarningInput && <Icon name="checkmark" size={16} color={Colors.black} />}
            </View>
          </Pressable>
          {showContentWarningInput && (
            <View
              style={[
                styles.sheetInputContainer,
                isKeyboardVisible && styles.sheetInputContainerKeyboard,
              ]}
            >
              <TextInput
                nativeID="video-post-warning-input"
                style={styles.otherWarningInput}
                placeholder="specify content warning"
                placeholderTextColor={Colors.neutral[200]}
                value={otherWarning}
                onChangeText={setOtherWarning}
                autoFocus={true}
                returnKeyType="done"
                autoComplete="off"
                textContentType="none"
                importantForAutofill="no"
                caretHidden={false}
              />
            </View>
          )}
        </View>
      </VerticalListSheet>

      <VerticalListSheet
        name="post-comment-settings-sheet"
        onDismiss={() => {}}
        title="Comments"
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
                TrueSheet.dismiss('post-comment-settings-sheet');
              }}
              disabled={commentFilter === filter.id}
            />
          ))}
        </View>
      </VerticalListSheet>

      <VerticalListSheet
        name="post-channel-selection-sheet"
        onDismiss={() => {}}
        title="Pick a channel"
        showCancelButton={true}
        cancelButtonText="Close"
        titleSize={26}
        hideCloseButton={true}
      >
        <ScrollView
          style={styles.sheetContent}
          contentContainerStyle={[
            styles.sheetContentContainer,
            { paddingBottom: 52 + insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled={true}
        >
          <VerticalListButton
            label="none"
            onPress={() => {
              setSelectedChannel(null);
              TrueSheet.dismiss('post-channel-selection-sheet');
            }}
            disabled={selectedChannel === null}
          />
          {getPostableChannels().map(channel => {
            const channelUri = channel.uri;
            return (
              <Pressable
                key={channel.slug}
                style={styles.channelListButton}
                onPress={() => {
                  setSelectedChannel(orbytChannelToSubscribedChannel(channel));
                  TrueSheet.dismiss('post-channel-selection-sheet');
                }}
                disabled={selectedChannel?.uri === channelUri}
              >
                <View style={styles.listButtonContent}>
                  <View style={styles.channelSelectorRow}>
                    {shouldShowChannelSlash(channel.uri) && (
                      <Text
                        style={[
                          styles.channelListButtonText,
                          styles.orbytSlash,
                          styles.channelSelectorNameSemiBold,
                          {
                            color: channel.channelColor || Colors.amber[400],
                          },
                        ]}
                      >
                        /
                      </Text>
                    )}
                    <Text style={[styles.channelListButtonText, styles.channelSelectorNameBold]}>
                      {channel.displayName.toLowerCase()}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </VerticalListSheet>
    </>
  );

  // Layout for landscape mode
  if (orientation === 'landscape' && isTablet) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
        <Animated.View style={[styles.landscapeContainer, fadeAnimatedStyle]}>
          {/* Left: Info Side */}
          <View style={styles.landscapeInfoSide}>
            <ScrollView
              style={styles.landscapeScrollContent}
              contentContainerStyle={[styles.landscapeInfoScroll, styles.landscapeScrollPadding]}
            >
              {/* Header Buttons */}
              <View style={styles.landscapeButtonsContainer}>
                <Pressable onPress={handleCancel} style={styles.landscapeHeaderButton}>
                  <BackArrowIcon size={32} color={Colors.neutral[50]} />
                </Pressable>
                <Pressable
                  onPress={handleDownload}
                  disabled={isDownloading || isMerging || !activeVideoPath}
                  style={styles.landscapeHeaderButton}
                >
                  {isDownloading ? (
                    <ActivityIndicator size="large" color={Colors.neutral[50]} />
                  ) : (
                    <Icon name="save" size={30} color={Colors.neutral[50]} />
                  )}
                </Pressable>
              </View>
              <DescriptionPreview
                description={description}
                formattedRichText={formattedRichText}
                onPress={() => setShowDescriptionInputModal(true)}
              />
              <ChannelSelector
                selectedChannel={selectedChannel}
                onPress={() => TrueSheet.present('post-channel-selection-sheet')}
                showRing={false}
              />
              <CommentFilterSelector
                commentFilter={commentFilter}
                getSelectedCommentFilterLabel={getSelectedCommentFilterLabel}
                onPress={() => TrueSheet.present('post-comment-settings-sheet')}
              />
              <ContentWarningSelector
                selectedContentWarnings={selectedContentWarnings}
                otherWarning={otherWarning}
                getSelectedContentWarningsLabel={getSelectedContentWarningsLabel}
                onPress={() => TrueSheet.present('post-content-warnings-sheet')}
              />
              <View
                style={[
                  styles.landscapePostButtonContainer,
                  { paddingBottom: Math.max(insets.bottom, 20) },
                ]}
              >
                <PostButton
                  onPress={handlePost}
                  isPosting={isPosting}
                  isCompressing={isCompressing}
                  uploadProgress={uploadProgress}
                  buttonStyle="landscape"
                  screenWidth={screenWidth}
                />
              </View>
            </ScrollView>
          </View>
          {/* Right: Video Preview Side */}
          <View style={styles.landscapeVideoSide}>
            <View style={styles.previewSection}>
              <VideoPreviewContent
                key={videoUri}
                thumbnailPath={thumbnailPath}
                videoUri={videoUri}
                player={player}
                videoLoading={videoLoading}
                isMerging={isMerging}
                videoError={videoError}
                textOverlays={textOverlays}
                containerStyle={styles.landscapeVideoContainer}
              />
            </View>
          </View>
        </Animated.View>
        {renderModals()}
      </SafeAreaView>
    );
  }

  // Portrait layout: content extends under transparent status bar; header buttons use safe area
  // No KeyboardAvoidingView so the list does not resize when keyboard opens (description/edit inputs live in modals/sheets).
  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      {renderHeader()}
      <View style={styles.container}>
        <Animated.ScrollView
          style={[styles.contentContainer, fadeAnimatedStyle]}
          contentContainerStyle={[
            styles.portraitScrollContent,
            {
              paddingTop: insets.top,
              paddingBottom: 60 + Math.max(insets.bottom, 20) + 80,
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Video Preview - in flow, safe area from paddingTop */}
          <View style={styles.portraitPreviewSection}>
            <VideoPreviewContent
              key={videoUri}
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

          <DescriptionPreview
            description={description}
            formattedRichText={formattedRichText}
            onPress={() => setShowDescriptionInputModal(true)}
          />

          <View style={styles.sectionDivider} />

          <ChannelSelector
            selectedChannel={selectedChannel}
            onPress={() => TrueSheet.present('post-channel-selection-sheet')}
            showRing={false}
          />

          <CommentFilterSelector
            commentFilter={commentFilter}
            getSelectedCommentFilterLabel={getSelectedCommentFilterLabel}
            onPress={() => TrueSheet.present('post-comment-settings-sheet')}
          />

          <ContentWarningSelector
            selectedContentWarnings={selectedContentWarnings}
            otherWarning={otherWarning}
            getSelectedContentWarningsLabel={getSelectedContentWarningsLabel}
            onPress={() => TrueSheet.present('post-content-warnings-sheet')}
          />
        </Animated.ScrollView>
      </View>

      <View
        style={[styles.floatingPostButtonContainer, { paddingBottom: Math.max(insets.bottom, 20) }]}
        pointerEvents="box-none"
      >
        <PostButton
          onPress={handlePost}
          isPosting={isPosting}
          isCompressing={isCompressing}
          uploadProgress={uploadProgress}
          buttonStyle="portrait"
          width={screenWidth * 0.6}
          screenWidth={screenWidth}
        />
      </View>

      {renderModals()}
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
  headerButton: {
    position: 'absolute',
    zIndex: 1000,
    padding: 8,
    borderRadius: BORDER_RADIUS.LARGE,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.overlay.black50,
  },
  headerButtonLeft: {
    left: 4,
  },
  headerButtonRight: {
    right: 4,
  },
  contentContainer: {
    flex: 1,
  },
  portraitScrollContent: {
    paddingHorizontal: 0,
  },
  portraitPreviewSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  previewSection: {
    position: 'absolute',
    top: 22,
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
    backgroundColor: Colors.black,
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
    backgroundColor: Colors.transparent,
  },
  errorOverlay: {
    zIndex: 3,
    backgroundColor: Colors.neutral[900],
  },
  errorText: {
    color: Colors.neutral[200],
    fontSize: 16,
  },
  descriptionSectionNoPadding: {
    paddingBottom: 0,
  },
  sectionHeaderTitleSmall: {
    marginBottom: 4,
  },
  descriptionModalHeaderTitle: {
    marginBottom: 0,
  },
  channelSelectorNameSemiBold: {
    fontFamily: 'Figtree-SemiBold',
  },
  channelSelectorNameBold: {
    fontFamily: 'Figtree-Bold',
  },
  channelSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButtonCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  landscapeScrollContent: {
    flex: 1,
  },
  landscapeScrollPadding: {
    paddingBottom: 40,
  },
  landscapeVideoContainer: {
    width: '100%',
    aspectRatio: DEFAULT_VIDEO_ASPECT_RATIO,
    maxHeight: '90%',
  },
  textOverlayContainer: {
    position: 'absolute',
    padding: 8,
    minWidth: 50,
    zIndex: 2,
  },
  textOverlay: {
    color: Colors.neutral[200],
    fontSize: 22,
    fontFamily: 'Figtree-Bold',
    textAlign: 'center',
    textShadowColor: Colors.overlay.black50,
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
    padding: 4,
  },
  descriptionSection: {
    padding: 15,
    paddingBottom: 0,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  section: {
    padding: 15,
    paddingTop: 8,
    paddingBottom: 8,
  },
  sectionDivider: {
    height: 2,
    backgroundColor: Colors.neutral[900],
    marginHorizontal: 15,
    marginVertical: 4,
  },
  sectionHeaderTitle: {
    color: Colors.neutral[200],
    fontSize: 18,
    fontFamily: 'Figtree-Bold',
    marginBottom: 12,
  },
  orbytSlash: {
    fontFamily: 'Figtree-SemiBold',
    marginRight: 0,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: BORDER_RADIUS.SMALL,
    borderWidth: 2,
    borderColor: Colors.neutral[200],
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: Colors.neutral[50],
    borderColor: Colors.neutral[50],
  },
  otherWarningInput: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[200],
    paddingVertical: 12,
    paddingHorizontal: 0,
    color: Colors.neutral[200],
    marginTop: 5,
    marginBottom: 10,
    fontFamily: 'Figtree-Regular',
    fontSize: 18,
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
    backgroundColor: Colors.neutral[200],
    shadowColor: Colors.neutral[200],
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
    shadowColor: Colors.neutral[200],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  glassBackground: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BORDER_RADIUS.FULL,
  },
  buttonContent: {
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },
  postButtonText: {
    color: Colors.black,
    fontSize: 18,
    fontFamily: 'Figtree-Black',
  },
  floatingPostButtonDisabled: {
    opacity: 0.5,
  },
  landscapePostButtonDisabled: {
    opacity: 0.5,
  },
  landscapeContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Colors.black,
  },
  landscapeInfoSide: {
    flex: 1,
    padding: 20,
    backgroundColor: Colors.black,
    justifyContent: 'flex-start',
    minWidth: 0,
  },
  landscapeButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  landscapeHeaderButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  landscapeInfoScroll: {
    paddingBottom: 80,
  },
  landscapeVideoSide: {
    flex: 1,
    backgroundColor: Colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
    padding: 0,
  },
  landscapePostButtonContainer: {
    marginTop: 24,
    width: '100%',
    alignItems: 'center',
  },
  landscapePostButtonHost: {
    height: 60,
    borderRadius: BORDER_RADIUS.FULL,
    backgroundColor: Colors.neutral[200],
    shadowColor: Colors.neutral[200],
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
    shadowColor: Colors.neutral[200],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
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
    backgroundColor: Colors.neutral[900],
    overflow: 'hidden',
    borderWidth: 0,
    borderColor: Colors.black,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  channelListButtonText: {
    color: Colors.neutral[200],
    fontFamily: 'Figtree-SemiBold',
    fontSize: 18,
  },
  listButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
  },
  sheetOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
    paddingHorizontal: 20,
    marginHorizontal: 12,
    marginBottom: 12,
    backgroundColor: Colors.neutral[900],
    borderRadius: BORDER_RADIUS.LARGE,
  },
  sheetOptionText: {
    color: Colors.neutral[200],
    fontSize: 18,
    fontFamily: 'Figtree-SemiBold',
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
    color: Colors.neutral[200],
    fontFamily: 'Figtree-Regular',
    fontSize: 15,
    lineHeight: 22,
  },
  descriptionInputPreviewNormal: {
    color: Colors.neutral[200],
    fontFamily: 'Figtree-Regular',
    fontSize: 15,
    lineHeight: 22,
  },
  descriptionInputPreviewMedium: {
    color: Colors.neutral[200],
    fontFamily: Typography.families.medium,
    fontSize: 15,
    lineHeight: 22,
  },
  descriptionInputPreviewSemiBold: {
    color: Colors.neutral[200],
    fontFamily: Typography.families.bold,
    fontSize: 15,
    lineHeight: 22,
  },
  descriptionInputPlaceholder: {
    color: Colors.neutral[600],
  },
  descriptionModalContainer: {
    flex: 1,
  },
  descriptionModalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay.black85,
  },
  descriptionModalContentWrapper: {
    flex: 1,
    backgroundColor: Colors.overlay.black95,
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
  descriptionModalDoneButton: {
    paddingVertical: 0,
    paddingLeft: 16,
    paddingRight: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  descriptionModalDoneText: {
    color: Colors.neutral[200],
    fontSize: 18,
    fontFamily: 'Figtree-Medium',
  },
  descriptionModalDoneTextDisabled: {
    color: Colors.coral[500],
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
    // Text is transparent - overlay shows formatted rich text (mentions/hashtags)
    color: Colors.transparent,
    fontFamily: 'Figtree-Regular',
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
    color: Colors.neutral[200],
    fontFamily: 'Figtree-Regular',
    fontSize: 15,
    textAlignVertical: 'top',
    includeFontPadding: false,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  descriptionInputOverlayNormal: {
    color: Colors.neutral[200],
    fontFamily: 'Figtree-Regular',
    fontSize: 15,
  },
  descriptionInputOverlayMedium: {
    color: Colors.neutral[200],
    fontFamily: Typography.families.medium,
    fontSize: 15,
  },
  descriptionInputOverlaySemiBold: {
    color: Colors.neutral[200],
    fontFamily: Typography.families.bold,
    fontSize: 15,
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
    backgroundColor: Colors.neutral[900],
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
    color: Colors.neutral[200],
    fontSize: 18,
    fontFamily: 'Figtree-Medium',
  },
  channelSelectorNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  channelSelectorName: {
    color: Colors.neutral[50],
    fontSize: 18,
    fontFamily: 'Figtree-Medium',
  },
});

export default VideoPostScreen;
