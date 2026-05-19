import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { BORDER_RADIUS } from '@/utils/constants';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
  TextInput,
  Modal,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NativePressable } from '@/components/ui/NativePressable';
import { SquircleNativePressable } from '@/components/ui/Squircle';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useVideoPlayer, VideoView, VideoPlayer } from 'expo-video';
import { FFmpegKit } from 'ffmpeg-kit-react-native';
import * as MediaLibrary from 'expo-media-library';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { useRouter, useFocusEffect } from 'expo-router';
import { Avatar } from '@/components/ui/UI';
import Icon, { BackArrowIcon, DownSmallFillIcon } from '@/components/ui/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TextOverlay } from '@/types';
import { resolveVideoPath, VideoPathInfo } from '@/utils/video/path';
import { FULLSCREEN_BUFFER_OPTIONS, DEFAULT_VIDEO_ASPECT_RATIO } from '@/utils/video/helpers';
import { Colors } from '@/theme';
import { FontFamily, Typography, TextStyles } from '@/utils/components/typography';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import { AtprotoFeedService } from '@/services/api/feed/FeedService';
import VideoProcessingService from '@/services/video/VideoProcessingService';
import { logger } from '@/utils/logger';
import { useVideoPostDraftStore } from '@/stores/videoPostDraftStore';
import { usePendingVideoPostStore } from '@/stores/pendingVideoPostStore';
import {
  getPostableChannels,
  shouldShowChannelSlash,
  OrbytChannel,
  extractFeedSlug,
  getChannelAvatarUri,
  getChannelByUri,
  getLocalizedChannelDisplayName,
} from '@/utils/channels/orbyt';
import type { SubscribedChannel } from '@/stores/userStore';
import VerticalListSheet, {
  VerticalListButton,
  TrueSheet,
} from '@/components/ui/VerticalListSheet';
import { SHEET_STYLES } from '@/utils/components/truesheet';
import { MentionInputWithSearch } from '@/components/ui/MentionInputWithSearch';

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
  onPress: () => void;
}> = ({ description, onPress }) => {
  const { t } = useTranslation();
  return (
    <View style={[styles.descriptionSection, styles.descriptionSectionNoPadding]}>
      <Text style={[styles.sectionHeaderTitle, styles.sectionHeaderTitleSmall]}>
        {t('video.description')}
      </Text>
      <NativePressable onPress={onPress} style={styles.descriptionInputTouchable}>
        {description ? (
          <Text style={styles.descriptionInputPreview} numberOfLines={3}>
            {description}
          </Text>
        ) : (
          <Text style={[styles.descriptionInputPreview, styles.descriptionInputPlaceholder]}>
            {t('video.addTextPlaceholder')}
          </Text>
        )}
      </NativePressable>
    </View>
  );
};

// Reusable channel selector component
const ChannelSelector: React.FC<{
  selectedChannel: SubscribedChannel | null;
  onPress: () => void;
  showRing?: boolean;
}> = ({ selectedChannel, onPress, showRing = false }) => {
  const { t } = useTranslation();
  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeaderTitle}>{t('video.channelOptional')}</Text>
      <View style={styles.channelSelectorContainer}>
        <SquircleNativePressable style={styles.channelSelectorBox} onPress={onPress}>
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
        </SquircleNativePressable>
        <NativePressable style={styles.channelSelectorLabelPressable} onPress={onPress}>
          {!selectedChannel ? (
            <View style={styles.channelSelectorPlaceholderContainer}>
              <Text style={styles.channelSelectorPlaceholderText}>{t('video.pickChannel')}</Text>
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
                {selectedChannel.displayName}
              </Text>
            </View>
          )}
        </NativePressable>
      </View>
    </View>
  );
};

// Reusable comment filter selector component
const CommentFilterSelector: React.FC<{
  commentFilter: string | null;
  getSelectedCommentFilterLabel: () => string;
  onPress: () => void;
}> = ({ commentFilter, getSelectedCommentFilterLabel, onPress }) => {
  const { t } = useTranslation();
  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeaderTitle}>{t('video.comments')}</Text>
      <View style={styles.channelSelectorContainer}>
        <SquircleNativePressable style={styles.channelSelectorBox} onPress={onPress}>
          <Icon name="chat_3" size={32} color={Colors.neutral[200]} />
        </SquircleNativePressable>
        <NativePressable style={styles.channelSelectorLabelPressable} onPress={onPress}>
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
        </NativePressable>
      </View>
    </View>
  );
};

// Reusable content warning selector component
const ContentWarningSelector: React.FC<{
  selectedContentWarnings: string[];
  otherWarning: string;
  getSelectedContentWarningsLabel: () => string;
  onPress: () => void;
}> = ({ selectedContentWarnings, otherWarning, getSelectedContentWarningsLabel, onPress }) => {
  const { t } = useTranslation();
  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeaderTitle}>{t('video.warnings')}</Text>
      <View style={styles.channelSelectorContainer}>
        <SquircleNativePressable style={styles.channelSelectorBox} onPress={onPress}>
          <Icon name="warning" size={32} color={Colors.neutral[200]} />
        </SquircleNativePressable>
        <NativePressable style={styles.channelSelectorLabelPressable} onPress={onPress}>
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
        </NativePressable>
      </View>
    </View>
  );
};

// Reusable post button component
const PostButton: React.FC<{
  onPress: () => void;
  isPosting: boolean;
  uploadProgress: number;
  buttonStyle?: 'landscape' | 'portrait';
  width?: number;
  screenWidth?: number;
}> = ({ onPress, isPosting, uploadProgress, buttonStyle = 'portrait', width, screenWidth }) => {
  const { t } = useTranslation();
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
              ? t('video.uploadingVideo')
              : uploadProgress < 90
                ? t('video.processingVideo')
                : t('video.creatingPost')}
          </Text>
        </View>
      ) : (
        <Text style={styles.postButtonText}>{t('video.post')}</Text>
      )}
    </View>
  );

  return (
    <SquircleNativePressable
      style={[
        glassStyle,
        { width: buttonWidth },
        !(Platform.OS === 'ios' && isLiquidGlassAvailable()) && hostStyle,
        isPosting && disabledStyle,
      ]}
      onPress={onPress}
      disabled={isPosting}
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
    </SquircleNativePressable>
  );
};

// Reusable description input modal component
const DescriptionInputModal: React.FC<{
  visible: boolean;
  description: string;
  setDescription: (text: string) => void;
  selection?: { start: number; end: number };
  setDescriptionSelection: (selection: { start: number; end: number }) => void;
  onClose: () => void;
  inputRef?: React.RefObject<TextInput | null>;
  insets: { top: number };
}> = ({
  visible,
  description,
  setDescription,
  selection,
  setDescriptionSelection,
  onClose,
  inputRef,
  insets,
}) => {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <View style={styles.descriptionModalContainer}>
        <View style={styles.descriptionModalOverlay}>
          <View style={[styles.descriptionModalContentWrapper, { paddingTop: insets.top }]}>
            {/* Dynamic paddingTop based on safe area insets */}
            <View style={styles.descriptionModalHeader}>
              <View style={styles.descriptionModalHeaderSpacer} />
              <Text style={[styles.sectionHeaderTitle, styles.descriptionModalHeaderTitle]}>
                {t('video.description')}
              </Text>
              <NativePressable
                onPress={onClose}
                style={[
                  styles.descriptionModalDoneButton,
                  description.length > 300 && styles.descriptionModalDoneButtonDisabled,
                ]}
                disabled={description.length > 300}
                accessibilityLabel={
                  description.length > 300 ? t('video.descriptionTooLong') : t('common.done')
                }
              >
                <Text
                  style={[
                    styles.descriptionModalDoneText,
                    description.length > 300 && styles.descriptionModalDoneTextDisabled,
                  ]}
                >
                  {description.length > 300 ? `+${description.length - 300}` : t('common.done')}
                </Text>
              </NativePressable>
            </View>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.descriptionModalContent}
              keyboardVerticalOffset={0}
            >
              <MentionInputWithSearch
                value={description}
                onChangeText={setDescription}
                selection={selection}
                onSelectionChange={e => {
                  setDescriptionSelection(e.nativeEvent.selection);
                }}
                placeholder={t('video.addTextPlaceholder')}
                maxLength={300}
                inputRef={inputRef}
                multiline
                layoutMode="vertical-list"
                searchBannerPosition="below"
                containerStyle={styles.descriptionInputContainer}
                inputStyle={styles.descriptionModalInput}
                searchBannerContainerStyle={styles.searchModalContainer}
                textInputProps={{
                  nativeID: 'video-post-description-input',
                  autoFocus: true,
                  selectionColor: Colors.neutral[200],
                  cursorColor: Colors.neutral[200],
                }}
                onSubmit={onClose}
              />
            </KeyboardAvoidingView>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// Content warning options - use labelKey for i18n
const CONTENT_WARNINGS = [
  { id: 'nsfw', labelKey: 'video.adultContent' as const },
  { id: 'nudity', labelKey: 'video.nudity' as const },
  { id: 'violence', labelKey: 'video.violence' as const },
  { id: 'sensitive', labelKey: 'video.sensitiveContent' as const },
];

// Comment filtering options - use labelKey for i18n
const COMMENT_FILTERS = [
  { id: 'all', labelKey: 'video.allowAllComments' as const },
  { id: 'followers', labelKey: 'video.onlyFollowersCanComment' as const },
  { id: 'mentioned', labelKey: 'video.onlyMentionedCanComment' as const },
  { id: 'none', labelKey: 'video.noOneCanComment' as const },
];

const VideoPostScreen: React.FC = () => {
  const { t } = useTranslation();
  const consumePayload = usePendingVideoPostStore(s => s.consumePayload);
  const [payload] = useState(() => consumePayload());

  const videoPath = payload?.videoPath;
  const segments = payload?.segments ?? [];
  const segmentsForDraft = segments.length > 0 ? JSON.stringify(segments) : null;

  const [thumbnailPath, setThumbnailPath] = useState<string | undefined>(
    payload?.thumbnailPath ?? undefined
  );

  const textOverlays = (payload?.textOverlays ?? []) as TextOverlay[];
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

  const [isDownloading, setIsDownloading] = useState(false);

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
  }, [headerFadeOpacity, fadeOpacity]);

  const fadeAnimatedStyle = useAnimatedStyle(() => ({
    opacity: fadeOpacity.value,
  }));

  const headerFadeAnimatedStyle = useAnimatedStyle(() => ({
    opacity: headerFadeOpacity.value,
  }));

  // Rich text search input ref for description modal
  const descriptionInputRef = useRef<TextInput | null>(null);

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
    let shouldCancel = true;
    const mergeSegments = async () => {
      try {
        if (ac.signal.aborted) return;
        setIsMerging(true);

        const mergedVideo = await VideoProcessingService.mergeSegments(segments);

        if (ac.signal.aborted) return;
        shouldCancel = false;
        setMergedVideoPath(mergedVideo.path);
        setIsMerging(false);

        logger.info('Background merging completed', {
          component: 'VideoPostScreen',
          mergedPath: mergedVideo.path,
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : t('errors.unknown');
        logger.error('Background merging failed', error, { component: 'VideoPostScreen' });
        if (ac.signal.aborted) return;
        shouldCancel = false;
        setIsMerging(false);
        Alert.alert(t('video.mergingFailed'), errorMessage || t('video.mergingFailedMessage'), [
          {
            text: t('common.goBack'),
            onPress: () => router.back(),
          },
        ]);
      }
    };

    mergeSegments();
    return () => {
      if (shouldCancel) {
        void FFmpegKit.cancel();
      }
      ac.abort();
    };
  }, [segments, mergedVideoPath, router, t]);

  // No valid video source
  const hasVideoSource = Boolean(videoPath || segments.length > 0);
  useEffect(() => {
    if (!hasVideoSource) {
      setVideoLoading(false);
      setVideoError(t('video.noVideo'));
    }
  }, [hasVideoSource, t]);

  // removed legacy expo-av handlers (not used with expo-video)

  const toggleContentWarning = (id: string) => {
    if (selectedContentWarnings.includes(id)) {
      setSelectedContentWarnings(selectedContentWarnings.filter(item => item !== id));
    } else {
      setSelectedContentWarnings([...selectedContentWarnings, id]);
    }
  };

  // Helper functions to get selected labels for display
  const getSelectedCommentFilterLabel = () => {
    if (!commentFilter) return t('video.chooseWhoCanComment');
    const filter = COMMENT_FILTERS.find(f => f.id === commentFilter);
    return filter ? t(filter.labelKey) : t('video.chooseWhoCanComment');
  };

  const getSelectedContentWarningsLabel = () => {
    if (selectedContentWarnings.length === 0 && !otherWarning.trim()) {
      return t('video.applyAnyWarnings');
    }
    const warningLabels = selectedContentWarnings.map(id => {
      const warning = CONTENT_WARNINGS.find(w => w.id === id);
      return warning ? t(warning.labelKey) : id;
    });
    if (otherWarning.trim()) {
      warningLabels.push(t('common.other'));
    }
    return warningLabels.length > 0 ? warningLabels.join(', ') : t('video.applyAnyWarnings');
  };

  const handlePost = async () => {
    if (isPosting || isMerging) {
      if (isMerging) {
        Alert.alert(t('video.pleaseWait'), t('video.videoMergingWait'));
      }
      return;
    }

    if (!activeVideoPath) {
      Alert.alert(t('common.error'), t('video.noVideoSelected'));
      return;
    }

    // Path is already standardized and validated - trust it
    const videoPathToUse = activeVideoPath;

    // Collect all content warnings, including custom one if present (before try block for error handling)
    const allContentWarnings = [...selectedContentWarnings];
    if (otherWarning.trim()) {
      allContentWarnings.push('other:' + otherWarning.trim());
    }

    let channelSlug: string | undefined;

    try {
      setIsPosting(true);
      setUploadProgress(0);

      channelSlug = selectedChannel ? extractFeedSlug(selectedChannel.uri) || undefined : undefined;

      const videoPathToUpload = videoPathToUse;

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

      const { useUIStore } = await import('@/stores/uiStore');
      const { storage } = await import('@/utils/storage/storage');
      const UPLOAD_KEY = 'video-upload';
      useUIStore.getState().setLoading(UPLOAD_KEY, true);

      const { VideoService } = await import('@/services/api/video/VideoService');

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

      router.replace('/(tabs)/home');

      (async () => {
        try {
          const processedBlob = await VideoService.waitForJob(uploadResult.jobId, progress => {
            useUIStore.getState().setProgress(UPLOAD_KEY, progress);
          });

          const result = await AtprotoFeedService.createVideoPost(
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

          Alert.alert(t('video.uploadFailed'), t('video.uploadFailedRetry'), [
            { text: t('common.ok') },
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
        Alert.alert(t('video.uploadFailed'), t('video.uploadFailedRetryPrompt'), [
          {
            text: t('common.close'),
            style: 'cancel',
          },
          {
            text: t('video.retry'),
            onPress: () => {
              // Retry the upload
              handlePost();
            },
          },
        ]);
      } else if (errorMessage?.includes('unauthorized')) {
        Alert.alert(t('video.authenticationFailed'), t('video.authenticationFailedMessage'), [
          { text: t('common.ok') },
        ]);
      } else if (errorMessage?.includes('Video compression failed')) {
        Alert.alert(t('video.compressionFailed'), t('video.compressionFailedMessage'), [
          { text: t('common.ok') },
        ]);
      } else {
        // Generic error - still offer retry
        Alert.alert(t('video.uploadFailed'), t('video.uploadFailedGeneric'), [
          {
            text: t('common.close'),
            style: 'cancel',
          },
          {
            text: t('video.retry'),
            onPress: () => {
              // Retry the upload
              handlePost();
            },
          },
        ]);
      }
    } finally {
      setIsPosting(false);
      setUploadProgress(0);
    }
  };

  const handleCancel = () => {
    if (isMerging || segments.length > 0) {
      void FFmpegKit.cancel();
    }
    router.back();
  };

  const handleDownload = async () => {
    if (!activeVideoPath || isDownloading || isMerging) {
      if (isMerging) {
        Alert.alert(t('video.pleaseWait'), t('video.videoMergingWait'));
      }
      return;
    }

    try {
      setIsDownloading(true);

      // Request media library permissions
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('video.permissionRequired'), t('video.photoLibraryPermissionRequired'), [
          { text: t('common.ok') },
        ]);
        setIsDownloading(false);
        return;
      }

      const videoPathToDownload = activeVideoPath;

      // Resolve the video path to ensure it's accessible
      const pathInfo = await resolveVideoPath(videoPathToDownload);

      if (!pathInfo.exists) {
        Alert.alert(t('video.videoNotFound'), t('video.videoNotFoundRetry'), [
          { text: t('common.ok') },
        ]);
        setIsDownloading(false);
        return;
      }

      // Use the resolved URI (already has file:// prefix)
      const fileUri = pathInfo.uri;

      // Save video to media library
      const asset = await MediaLibrary.createAssetAsync(fileUri);

      Alert.alert(t('video.videoSaved'), t('video.videoSavedToLibrary'), [
        { text: t('common.ok') },
      ]);

      logger.info('Video downloaded successfully', {
        component: 'VideoPostScreen',
        assetId: asset.id,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : t('errors.unknown');
      logger.error('Failed to download video', error, { component: 'VideoPostScreen' });
      Alert.alert(t('video.downloadFailed'), errorMessage || t('video.downloadFailedMessage'), [
        { text: t('common.ok') },
      ]);
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
          setVideoError(t('video.videoFileNotFound'));
        }
      } catch (error) {
        logger.error('Error resolving video path', error, { component: 'VideoPostScreen' });
        if (!ac.signal.aborted) setVideoError(t('video.unableToAccessVideoFile'));
      } finally {
        if (!ac.signal.aborted) setVideoLoading(false);
      }
    };

    resolveVideo();
    return () => ac.abort();
  }, [activeVideoPath, isMerging, t]);

  // Final video URI for playback
  const videoUri = videoPathInfo?.uri || '';

  // Simple video player - auto-plays when source is set
  const player = useVideoPlayer(videoUri ? { uri: videoUri } : null, p => {
    p.loop = true;
    p.volume = 1;
    p.bufferOptions = FULLSCREEN_BUFFER_OPTIONS;
    playerRef.current = p;
  });

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
    if (!showDescriptionInputModal) return undefined;
    const timer = setTimeout(() => {
      setDescriptionSelection({ start: description.length, end: description.length });
    }, 100);
    return () => clearTimeout(timer);
  }, [showDescriptionInputModal, description.length]);

  // Fixed container size with 9:16 aspect ratio
  const containerWidth = VIDEO_WIDTH;
  const containerHeight = containerWidth / DEFAULT_VIDEO_ASPECT_RATIO;

  const insets = useSafeAreaInsets();
  const { screenWidth, screenHeight, isTablet, isSmallPhone: isSmallDevice } = useDeviceLayout();
  const orientation = screenWidth > screenHeight ? 'landscape' : 'portrait';

  const headerButtonTopStyle = { top: isSmallDevice ? 5 : insets.top + 4 };

  // Render header (StatusBar transparent, header buttons keep safe area) - shared between portrait and landscape
  const renderHeader = () => (
    <>
      <StatusBar style="light" translucent />
      <Animated.View
        style={[
          styles.headerButton,
          styles.headerButtonLeft,
          headerButtonTopStyle,
          headerFadeAnimatedStyle,
        ]}
      >
        <NativePressable onPress={handleCancel} style={styles.headerButtonCenter}>
          <BackArrowIcon size={32} color={Colors.neutral[50]} />
        </NativePressable>
      </Animated.View>
      <Animated.View
        style={[
          styles.headerButton,
          styles.headerButtonRight,
          headerButtonTopStyle,
          headerFadeAnimatedStyle,
        ]}
      >
        <NativePressable
          onPress={handleDownload}
          disabled={isDownloading || isMerging || !activeVideoPath}
          style={styles.headerButtonCenter}
        >
          {isDownloading ? (
            <ActivityIndicator size="large" color={Colors.neutral[50]} />
          ) : (
            <Icon name="download" size={32} color={Colors.neutral[50]} />
          )}
        </NativePressable>
      </Animated.View>
    </>
  );

  // Render all modals/sheets - shared between portrait and landscape
  const renderModals = () => (
    <>
      <DescriptionInputModal
        visible={showDescriptionInputModal}
        description={description}
        selection={descriptionSelection}
        setDescription={setDescription}
        setDescriptionSelection={setDescriptionSelection}
        onClose={() => setShowDescriptionInputModal(false)}
        inputRef={descriptionInputRef}
        insets={insets}
      />

      <VerticalListSheet name="post-content-warnings-sheet" onDismiss={() => {}} scrollable={false}>
        <View style={styles.sheetContent}>
          <Text style={SHEET_STYLES.sheetScreenTitle}>{t('video.warnings')}</Text>
          {CONTENT_WARNINGS.map(warning => (
            <NativePressable
              key={warning.id}
              style={styles.sheetOptionRow}
              onPress={() => toggleContentWarning(warning.id)}
            >
              <Text style={styles.sheetOptionText}>{t(warning.labelKey)}</Text>
              <View
                style={[
                  styles.checkbox,
                  selectedContentWarnings.includes(warning.id) && styles.checkboxSelected,
                ]}
              >
                {selectedContentWarnings.includes(warning.id) && (
                  <Icon name="check" size={16} color={Colors.black} />
                )}
              </View>
            </NativePressable>
          ))}
          <NativePressable
            style={styles.sheetOptionRow}
            onPress={() => setShowContentWarningInput(!showContentWarningInput)}
          >
            <Text style={styles.sheetOptionText}>{t('video.otherWarning')}</Text>
            <View style={[styles.checkbox, showContentWarningInput && styles.checkboxSelected]}>
              {showContentWarningInput && <Icon name="check" size={16} color={Colors.black} />}
            </View>
          </NativePressable>
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
                placeholder={t('video.specifyWarning')}
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

      <VerticalListSheet name="post-comment-settings-sheet" onDismiss={() => {}}>
        <View style={styles.sheetContent}>
          <Text style={SHEET_STYLES.sheetScreenTitle}>{t('video.comments')}</Text>
          {COMMENT_FILTERS.map(filter => (
            <VerticalListButton
              key={filter.id}
              label={t(filter.labelKey)}
              onPress={() => {
                setCommentFilter(filter.id);
                TrueSheet.dismiss('post-comment-settings-sheet');
              }}
            />
          ))}
        </View>
      </VerticalListSheet>

      <VerticalListSheet name="post-channel-selection-sheet" onDismiss={() => {}} scrollable={true}>
        <ScrollView
          style={styles.sheetContent}
          contentContainerStyle={[
            styles.sheetContentContainer,
            { paddingBottom: 52 + insets.bottom },
          ]}
          showsVerticalScrollIndicator={true}
        >
          <Text style={SHEET_STYLES.sheetScreenTitle}>{t('video.pickChannel')}</Text>
          <VerticalListButton
            label={t('settings.none')}
            onPress={() => {
              setSelectedChannel(null);
              TrueSheet.dismiss('post-channel-selection-sheet');
            }}
          />
          {getPostableChannels().map(channel => {
            const channelDisplayName =
              getLocalizedChannelDisplayName(channel.uri, channel.displayName) ||
              channel.displayName ||
              '';
            return (
              <NativePressable
                key={channel.slug}
                style={styles.channelListButton}
                onPress={() => {
                  setSelectedChannel(orbytChannelToSubscribedChannel(channel));
                  TrueSheet.dismiss('post-channel-selection-sheet');
                }}
              >
                <View style={styles.listButtonContent}>
                  <Image
                    source={{ uri: getChannelAvatarUri(channel.uri) }}
                    contentFit="cover"
                    style={styles.channelListButtonGif}
                  />
                  <View style={styles.channelListTextContent}>
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
                      <Text
                        style={[styles.channelListButtonText, styles.channelSelectorNameBold]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {channelDisplayName}
                      </Text>
                    </View>
                    {!!channel.description && (
                      <Text
                        style={styles.channelListDescription}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {channel.description}
                      </Text>
                    )}
                  </View>
                </View>
              </NativePressable>
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
        <StatusBar style="light" translucent />
        <Animated.View style={[styles.landscapeContainer, fadeAnimatedStyle]}>
          {/* Left: Info Side */}
          <View style={styles.landscapeInfoSide}>
            <ScrollView
              style={styles.landscapeScrollContent}
              contentContainerStyle={[styles.landscapeInfoScroll, styles.landscapeScrollPadding]}
            >
              {/* Header Buttons */}
              <View style={styles.landscapeButtonsContainer}>
                <NativePressable onPress={handleCancel} style={styles.landscapeHeaderButton}>
                  <BackArrowIcon size={32} color={Colors.neutral[50]} />
                </NativePressable>
                <NativePressable
                  onPress={handleDownload}
                  disabled={isDownloading || isMerging || !activeVideoPath}
                  style={styles.landscapeHeaderButton}
                >
                  {isDownloading ? (
                    <ActivityIndicator size="large" color={Colors.neutral[50]} />
                  ) : (
                    <Icon name="download" size={30} color={Colors.neutral[50]} />
                  )}
                </NativePressable>
              </View>
              <DescriptionPreview
                description={description}
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
          showsVerticalScrollIndicator={true}
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
    fontSize: Typography.sizes.subtitle,
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
    fontFamily: FontFamily.semibold,
  },
  channelSelectorNameBold: {
    fontFamily: FontFamily.bold,
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
    ...TextStyles.sectionHeader,
    color: Colors.neutral[200],
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
    fontSize: Typography.sizes.title,
    fontFamily: FontFamily.bold,
    marginBottom: 12,
  },
  orbytSlash: {
    fontFamily: FontFamily.semibold,
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
    fontFamily: FontFamily.regular,
    fontSize: Typography.sizes.title,
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
    fontSize: Typography.sizes.title,
    fontFamily: FontFamily.black,
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
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
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
    fontFamily: FontFamily.semibold,
    fontSize: Typography.sizes.title,
    textTransform: 'lowercase',
  },
  listButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  channelListButtonGif: {
    width: 52,
    height: 52,
    borderRadius: BORDER_RADIUS.MEDIUM,
    backgroundColor: Colors.neutral[800],
  },
  channelListTextContent: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  channelListDescription: {
    color: Colors.neutral[500],
    fontSize: Typography.sizes.body,
    fontFamily: Typography.families.regular,
    lineHeight: Typography.lineHeights.body,
  },
  sheetOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
    paddingHorizontal: 20,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: Colors.neutral[900],
    borderRadius: BORDER_RADIUS.LARGE,
  },
  sheetOptionText: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.title,
    fontFamily: FontFamily.semibold,
    flex: 1,
  },
  sheetInputContainer: {
    marginBottom: 8,
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
    fontFamily: FontFamily.regular,
    fontSize: Typography.sizes.body,
    lineHeight: Typography.lineHeights.body,
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
    fontSize: Typography.sizes.title,
    fontFamily: FontFamily.medium,
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
    color: Colors.neutral[50],
    fontFamily: FontFamily.regular,
    fontSize: Typography.sizes.body,
    textAlignVertical: 'top',
    includeFontPadding: false,
    paddingVertical: 0,
    paddingHorizontal: 0,
    width: '100%',
    minHeight: 24,
    maxHeight: 400,
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
  channelSelectorLabelPressable: {
    flex: 1,
    minWidth: 0,
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
    fontSize: Typography.sizes.title,
    fontFamily: FontFamily.medium,
  },
  channelSelectorNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  channelSelectorName: {
    color: Colors.neutral[50],
    fontSize: Typography.sizes.title,
    fontFamily: FontFamily.medium,
    textTransform: 'lowercase',
  },
});

export default VideoPostScreen;
