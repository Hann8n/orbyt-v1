import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Platform,
} from 'react-native';
import { NativePressable } from '@/components/ui/NativePressable';
import { SquircleView, SquircleNativePressable } from '@/components/ui/Squircle';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { MenuView } from '@react-native-menu/menu';
import type { MenuAction } from '@react-native-menu/menu';
import Icon, { CloseFillIcon } from '../../ui/Icon';
import UI from '../../ui/UI';
import { Colors } from '../../../theme';
import { BORDER_RADIUS } from '../../../utils/constants';
import { androidTextFix } from '../../../utils/styling/platformText';
import { COMPOSER_STYLES } from '../../../utils/components/truesheet/sheetStyles';
import { COMPOSER_INPUT_PADDING, COMPOSER_INPUT_DIMENSIONS } from '../../../utils/components/truesheet/utils';
import { useMentionInput } from '../../ui/MentionInputWithSearch';
import { useUserStore } from '../../../stores/userStore';
import { useProfileByDid } from '../../../services/data/ProfileService';
import { FontFamily, Typography } from '../../../utils/components/typography';

interface CommentInputFooterProps {
  value: string;
  onChangeText: (text: string) => void;
  inputSelection: { start: number; end: number };
  onSelectionChange?: (e: { nativeEvent: { selection: { start: number; end: number } } }) => void;
  placeholder?: string;
  onSubmit: () => void;
  onPressGif?: () => void;
  onPressPhotos?: () => void;
  selectedGifPreviewUri?: string | null;
  /** Aspect ratio (width/height) for the selected GIF. Uses natural dimensions when available. */
  selectedGifAspectRatio?: number | null;
  selectedImages?: Array<{
    uri: string;
    alt: string;
    aspectRatio?: { width: number; height: number };
  }>;
  onRemoveImage?: (uri: string) => void;
  onClearGif?: () => void;
  hasAttachment?: boolean;
  onClearAttachment?: () => void;
  /**
   * Show/hide the current user's avatar at the start of the input row.
   * Useful for compact composers (e.g. share-sheet send message).
   */
  showAvatar?: boolean;
  /**
   * When true, show the send button even if the input is empty.
   * Useful for "optional message" composers (e.g. sending a video embed).
   */
  showSendWhenEmpty?: boolean;
  /**
   * External disable for submit (e.g. no recipient selected).
   */
  isSubmitDisabled?: boolean;
  /**
   * Accessibility label for the submit button.
   */
  submitAccessibilityLabel?: string;
  onCancelReply?: () => void;
  replyContext?: {
    authorName: string;
    parentUri: string;
    parentCid: string;
    level: number;
  } | null;
  isPosting?: boolean;
  maxLength?: number;
  inputRef?: React.RefObject<TextInput | null>;
  currentUserAvatar?: string | null;
  onFocus?: () => void;
  /**
   * When true, omit the add (+) control entirely (e.g. chat / messages composer).
   */
  hideMediaAddButton?: boolean;
}

const EMPTY_SELECTED_IMAGES = Object.freeze(
  [] as NonNullable<CommentInputFooterProps['selectedImages']>
);

interface AttachmentThumbProps {
  uri: string | null;
  aspectRatio: number;
  onRemove: (() => void) | null;
  removeLabel: string;
}

const AttachmentThumb: React.FC<AttachmentThumbProps> = ({ uri, aspectRatio, onRemove, removeLabel }) => (
  <SquircleView style={[styles.attachmentThumb, { aspectRatio }]}>
    {uri ? (
      <Image source={{ uri }} style={styles.attachmentThumbImage} contentFit="cover" />
    ) : (
      <View style={styles.attachmentThumbPlaceholder} />
    )}
    {onRemove ? (
      <NativePressable
        onPress={onRemove}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={styles.removeThumbButton}
        accessibilityRole="button"
        accessibilityLabel={removeLabel}
      >
        <BlurView style={styles.removeThumbPill} tint="dark" intensity={80}>
          <CloseFillIcon size={13} color={Colors.neutral[50]} />
        </BlurView>
      </NativePressable>
    ) : null}
  </SquircleView>
);

const CommentInputFooter: React.FC<CommentInputFooterProps> = ({
  value,
  onChangeText,
  inputSelection,
  onSelectionChange,
  placeholder,
  onSubmit,
  showAvatar = true,
  showSendWhenEmpty = false,
  isSubmitDisabled = false,
  submitAccessibilityLabel,
  onCancelReply,
  replyContext,
  isPosting = false,
  maxLength = 300,
  inputRef,
  currentUserAvatar,
  onFocus,
  hideMediaAddButton = false,
  onPressGif,
  onPressPhotos,
  selectedGifPreviewUri = null,
  selectedGifAspectRatio = null,
  selectedImages,
  onRemoveImage,
  onClearGif,
  hasAttachment = false,
  onClearAttachment,
}) => {
  const { mentionInputProps, banner } = useMentionInput({
    value,
    selection: inputSelection,
    onChangeText,
    onSelectionChange,
    inputRef,
    layoutMode: 'horizontal-pills',
  });
  const resolvedSelectedImages = selectedImages ?? EMPTY_SELECTED_IMAGES;
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t('comments.saySomething');
  const resolvedSubmitLabel = submitAccessibilityLabel ?? t('comments.sendComment');
  const charCount = value.length;
  const hasText = value.trim().length > 0;
  const remainingChars = maxLength - charCount;
  const showCharCount = remainingChars <= 50;
  const hasContent = hasText || !!hasAttachment;
  const shouldRenderSendButton = hasContent || showSendWhenEmpty;
  const isSendDisabled =
    isPosting || isSubmitDisabled || (!hasContent && !showSendWhenEmpty) || charCount > maxLength;
  const useLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

  // Get current user profile for live status
  const currentUserDid = useUserStore(state => state.currentUser?.did ?? null);
  const { data: currentUserProfile } = useProfileByDid(currentUserDid);

  const hasImages = resolvedSelectedImages.length > 0;
  // `selectedGifPreviewUri` can be null depending on the provider; `hasAttachment` is the reliable signal.
  const hasGifAttachment = !hasImages && !!hasAttachment;
  const gifAspectRatio =
    selectedGifAspectRatio && selectedGifAspectRatio > 0 ? selectedGifAspectRatio : 1;
  const attachmentKind: 'images' | 'gif' | 'none' = hasImages
    ? 'images'
    : hasGifAttachment
      ? 'gif'
      : 'none';
  const canOpenMediaDrawer = !!(onPressGif || onPressPhotos);
  const showAddControl =
    !hideMediaAddButton && canOpenMediaDrawer && !hasText && attachmentKind === 'none';
  const handlePickGif = () => {
    onPressGif?.();
  };

  const handlePickPhotos = () => {
    onPressPhotos?.();
  };

  const [inputHeight, setInputHeight] = React.useState<number>(COMPOSER_INPUT_DIMENSIONS.minHeight);

  const handleContentSizeChange = React.useCallback(
    (e: { nativeEvent: { contentSize: { height: number } } }) => {
      const h = e.nativeEvent.contentSize.height;
      setInputHeight(
        Math.max(
          COMPOSER_INPUT_DIMENSIONS.minHeight,
          Math.min(COMPOSER_INPUT_DIMENSIONS.maxHeight, h)
        )
      );
    },
    []
  );

  React.useEffect(() => {
    if (!value) {
      setInputHeight(COMPOSER_INPUT_DIMENSIONS.minHeight);
    }
  }, [value]);

  const mediaMenuActions: MenuAction[] = [];
  if (onPressGif) {
    mediaMenuActions.push({
      id: 'gif',
      title: t('comments.addGif'),
      attributes: { disabled: !!isPosting },
    });
  }
  if (onPressPhotos) {
    mediaMenuActions.push({
      id: 'photos',
      title: t('comments.addPhoto'),
      attributes: { disabled: !!isPosting },
    });
  }

  const handleMediaMenuPressAction = ({ nativeEvent }: { nativeEvent: { event?: string } }) => {
    const id = nativeEvent?.event;
    if (id === 'gif') {
      handlePickGif();
    } else if (id === 'photos') {
      handlePickPhotos();
    }
  };

  return (
    <View>
      {banner}
      <View style={styles.footerContainer}>
        <View style={[styles.inputContainer, { paddingBottom: COMPOSER_INPUT_PADDING.vertical }]}>
          <View style={styles.inputRow}>
            {showAvatar ? (
              <View style={styles.avatarContainer}>
                <UI.Avatar
                  uri={currentUserAvatar ?? undefined}
                  type="profile"
                  size={42}
                  style={styles.avatar}
                  status={currentUserProfile?.status}
                />
              </View>
            ) : null}
            <View style={styles.inputColumn}>
              <View style={styles.inputBubbleRow}>
                <SquircleView style={styles.inputWrapper}>
                  <TextInput
                    ref={inputRef}
                    {...mentionInputProps}
                    nativeID="comment-input"
                    placeholder={resolvedPlaceholder}
                    placeholderTextColor={Colors.neutral[500]}
                    multiline
                    maxLength={maxLength + 25}
                    style={[styles.textInput, { height: inputHeight }]}
                    onFocus={onFocus}
                    onContentSizeChange={handleContentSizeChange}
                    keyboardType="default"
                    returnKeyType="default"
                    autoComplete="off"
                    textContentType="none"
                    importantForAutofill="no"
                    textAlignVertical="top"
                  />
                </SquircleView>
                <View style={styles.sendColumn}>
                  <View style={styles.controlsRow}>
                    {showAddControl ? (
                      <MenuView
                        title=""
                        actions={mediaMenuActions}
                        onPressAction={handleMediaMenuPressAction}
                        shouldOpenOnLongPress={false}
                        themeVariant="dark"
                        isAnchoredToRight={true}
                      >
                        <NativePressable
                          style={[styles.addIconButton, isPosting && styles.iconButtonDisabled]}
                          disabled={isPosting || mediaMenuActions.length === 0}
                          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                          accessible={true}
                          accessibilityRole="button"
                          accessibilityLabel={t('common.add')}
                        >
                          <Icon name="add_circle" size={30} color={Colors.neutral[300]} />
                        </NativePressable>
                      </MenuView>
                    ) : null}
                    {shouldRenderSendButton ? (
                      <SquircleNativePressable
                        style={[
                          styles.sendButton,
                          !useLiquidGlass && styles.sendButtonFallback,
                          isSendDisabled && styles.sendButtonDisabled,
                        ]}
                        onPress={onSubmit}
                        disabled={isSendDisabled}
                        hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                        accessible={true}
                        accessibilityRole="button"
                        accessibilityLabel={resolvedSubmitLabel}
                      >
                        {useLiquidGlass ? (
                          <>
                            <GlassView
                              style={styles.glassBackground}
                              glassEffectStyle="clear"
                              tintColor="rgba(255, 255, 255, 1)"
                              isInteractive
                            />
                            <View style={styles.sendButtonContent} pointerEvents="none">
                              <Icon name="up" size={22} color={Colors.black} />
                            </View>
                          </>
                        ) : (
                          <Icon name="up" size={22} color={Colors.neutral[300]} />
                        )}
                      </SquircleNativePressable>
                    ) : replyContext && !hasText ? (
                      <SquircleNativePressable
                        style={[styles.sendButton, styles.cancelReplyButton]}
                        onPress={onCancelReply}
                        hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                        accessible={true}
                        accessibilityRole="button"
                        accessibilityLabel={t('comments.cancelReply')}
                      >
                        <Icon name="close" size={18} color={Colors.neutral[200]} />
                      </SquircleNativePressable>
                    ) : null}
                  </View>
                  {showCharCount ? (
                    <View style={styles.charCountOverlay} pointerEvents="none">
                      <Text
                        style={[styles.charCountText, charCount > maxLength && styles.charCountTextError]}
                      >
                        {remainingChars}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          </View>
        </View>
        {attachmentKind !== 'none' && (
          <View style={styles.attachmentTray}>
            {attachmentKind === 'gif' ? (
              <AttachmentThumb
                uri={selectedGifPreviewUri ?? null}
                aspectRatio={gifAspectRatio}
                onRemove={onClearGif ?? onClearAttachment ?? null}
                removeLabel={t('comments.removeGif')}
              />
            ) : (
              resolvedSelectedImages.slice(0, 4).map(img => (
                <AttachmentThumb
                  key={img.uri}
                  uri={img.uri}
                  aspectRatio={
                    img.aspectRatio && img.aspectRatio.height > 0
                      ? img.aspectRatio.width / img.aspectRatio.height
                      : 1
                  }
                  onRemove={onRemoveImage ? () => onRemoveImage(img.uri) : null}
                  removeLabel={t('comments.removeImage')}
                />
              ))
            )}
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  footerContainer: {
    backgroundColor: Colors.neutral[975],
    width: '100%',
    borderTopWidth: 1,
    borderColor: Colors.neutral[925],
  },
  inputContainer: COMPOSER_STYLES.container,
  inputRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 8,
  },
  inputColumn: {
    flex: 1,
    flexDirection: 'column' as const,
  },
  inputBubbleRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    gap: 8,
  },
  avatarContainer: {
    marginRight: 12,
    marginTop: 0,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: BORDER_RADIUS.FULL,
    borderWidth: 0,
  },
  inputWrapper: COMPOSER_STYLES.inputWrapper,
  textInput: {
    ...COMPOSER_STYLES.textInput,
    ...androidTextFix,
  },
  sendColumn: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: 8,
    alignSelf: 'center',
    position: 'relative',
    zIndex: 10,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  addIconButton: {
    padding: 0,
    backgroundColor: Colors.transparent,
    borderRadius: 0,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonDisabled: {
    opacity: 0.6,
  },
  sendButton: StyleSheet.flatten([COMPOSER_STYLES.sendButton, { marginLeft: 0 }]),
  sendButtonFallback: COMPOSER_STYLES.sendButtonFallback,
  sendButtonDisabled: {
    opacity: 0.6,
  },
  glassBackground: COMPOSER_STYLES.sendButtonGlassBg,
  sendButtonContent: COMPOSER_STYLES.sendButtonContent,
  cancelReplyButton: {
    backgroundColor: Colors.overlay.white10,
  },
  charCountOverlay: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 42,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  charCountText: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.bodySmall,
    textAlign: 'center',
    fontFamily: FontFamily.medium,
    lineHeight: Typography.lineHeights.bodySmall,
  },
  charCountTextError: {
    color: Colors.coral[300],
    height: 84,
  },
  attachmentTray: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.neutral[900],
  },
  attachmentThumb: {
    height: 72,
    maxWidth: 160,
    borderRadius: BORDER_RADIUS.SMALL,
    overflow: 'hidden',
    backgroundColor: Colors.neutral[900],
  },
  attachmentThumbImage: {
    width: '100%',
    height: '100%',
  },
  attachmentThumbPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.overlay.white10,
  },
  removeThumbButton: {
    position: 'absolute',
    top: 5,
    right: 5,
  },
  removeThumbPill: {
    width: 20,
    height: 20,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default CommentInputFooter;
