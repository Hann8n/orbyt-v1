import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  StyleSheet,
  Platform,
  Keyboard,
  type StyleProp,
  type ViewStyle,
  type ImageStyle,
  type NativeSyntheticEvent,
  type TargetedEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Image } from 'expo-image';
import { MenuView } from '@react-native-menu/menu';
import type { MenuAction } from '@react-native-menu/menu';
import Icon from '../../ui/Icon';
import UI from '../../ui/UI';
import { Colors } from '../../../theme';
import { BORDER_RADIUS } from '../../../utils/constants';
import { getFooterBottomPadding } from '../../../utils/components/truesheet/utils';
import { COMPOSER_STYLES } from '../../../utils/components/truesheet/sheetStyles';
import { UserSearchModal } from '../../ui/usersearch';
import { useUserStore } from '../../../stores/userStore';
import { useProfile } from '../../../services/data/ProfileService';
import { useAvatarProfileRing } from '../../../services/colors';
import { Typography } from '../../../utils/components/typography';

interface UserSearchModalProps {
  visible: boolean;
  onSelect: (user: { did: string; handle: string; displayName?: string; avatar?: string }) => void;
  onRequestClose: () => void;
  searchQuery: string;
  anchorPosition?: { x: number; y: number };
}

interface TextInputSelectionChangeEventData extends TargetedEvent {
  selection: {
    start: number;
    end: number;
  };
}

type TextInputSelectionChangeEvent = NativeSyntheticEvent<TextInputSelectionChangeEventData>;

interface MentionInputProps {
  ref?: React.RefObject<TextInput | null>;
  value: string;
  onChangeText: (text: string) => void;
  selection: { start: number; end: number };
  onSelectionChange?: (e: TextInputSelectionChangeEvent) => void;
  autoCorrect?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}

interface CommentInputFooterProps {
  value: string;
  onChangeText: (text: string) => void;
  inputSelection: { start: number; end: number };
  onSelectionChange: (e: TextInputSelectionChangeEvent) => void;
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
  userSearchModalProps?: UserSearchModalProps;
  mentionInputProps?: Partial<MentionInputProps>;
  onFocus?: () => void;
  /**
   * Override bottom padding (e.g. safe area). Use when embedded in a sheet that
   * should control padding externally to avoid double padding.
   */
  safeAreaBottom?: number;
}

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
  userSearchModalProps,
  mentionInputProps,
  onFocus,
  safeAreaBottom: safeAreaBottomProp,
  onPressGif,
  onPressPhotos,
  selectedGifPreviewUri = null,
  selectedGifAspectRatio = null,
  selectedImages = [],
  onRemoveImage,
  onClearGif,
  hasAttachment = false,
  onClearAttachment,
}) => {
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
  const currentUserHandle = useUserStore(state => state.currentUser?.handle ?? null);
  const currentUserDid = useUserStore(state => state.currentUser?.did ?? null);
  const { data: currentUserProfile } = useProfile(currentUserHandle);
  const ringProps = useAvatarProfileRing(currentUserDid);

  // Bottom padding: reduced safe area when keyboard closed; collapse when keyboard open
  // so the padding doesn't push the footer up with the keyboard.
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const rawSafeArea = safeAreaBottomProp !== undefined ? safeAreaBottomProp : insets.bottom;
  const clampedSafeArea = getFooterBottomPadding(rawSafeArea);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = () => setKeyboardVisible(true);
    const onHide = () => setKeyboardVisible(false);
    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const bottomPadding = keyboardVisible ? 0 : clampedSafeArea;

  const hasImages = selectedImages.length > 0;
  const hasGifPreview = !!selectedGifPreviewUri;
  // `selectedGifPreviewUri` can be null depending on the provider; `hasAttachment` is the reliable signal.
  const hasGifAttachment = !hasImages && !!hasAttachment;
  const gifAspectRatio =
    selectedGifAspectRatio && selectedGifAspectRatio > 0 ? selectedGifAspectRatio : 1;
  const gifAttachmentWrapStyle = useMemo(
    () => [styles.attachmentThumbWrap, { aspectRatio: gifAspectRatio }],
    [gifAspectRatio]
  );
  const attachmentThumbWrapStyle = useMemo<StyleProp<ViewStyle>>(
    () => styles.attachmentThumbWrap,
    []
  );
  const attachmentThumbImageStyle = useMemo<StyleProp<ImageStyle>>(
    () => styles.attachmentThumb,
    []
  );
  const attachmentKind: 'images' | 'gif' | 'none' = hasImages
    ? 'images'
    : hasGifAttachment
      ? 'gif'
      : 'none';
  const canOpenMediaDrawer = !!(onPressGif || onPressPhotos);
  const handlePickGif = useCallback(() => {
    onPressGif?.();
  }, [onPressGif]);

  const handlePickPhotos = useCallback(() => {
    onPressPhotos?.();
  }, [onPressPhotos]);

  const mediaMenuActions = useMemo<MenuAction[]>(() => {
    const actions: MenuAction[] = [];
    if (onPressGif) {
      actions.push({
        id: 'gif',
        title: t('comments.addGif'),
        attributes: { disabled: !!isPosting },
      });
    }
    if (onPressPhotos) {
      actions.push({
        id: 'photos',
        title: t('comments.addPhoto'),
        attributes: { disabled: !!isPosting },
      });
    }
    return actions;
  }, [onPressGif, onPressPhotos, isPosting, t]);

  const handleMediaMenuPressAction = useCallback(
    ({ nativeEvent }: { nativeEvent: { event?: string } }) => {
      const id = nativeEvent?.event;
      if (id === 'gif') {
        handlePickGif();
      } else if (id === 'photos') {
        handlePickPhotos();
      }
    },
    [handlePickGif, handlePickPhotos]
  );

  return (
    <View style={[styles.footerContainer, { paddingBottom: bottomPadding }]}>
      <View style={styles.inputContainer}>
        {attachmentKind === 'none' ? null : (
          <View style={styles.attachmentRow}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.attachmentStrip}
              keyboardShouldPersistTaps="handled"
            >
              {attachmentKind === 'gif' ? (
                <View style={gifAttachmentWrapStyle}>
                  {hasGifPreview ? (
                    <Image
                      source={{ uri: selectedGifPreviewUri ?? undefined }}
                      style={attachmentThumbImageStyle}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={styles.gifFallbackThumb} />
                  )}
                  {onClearGif ? (
                    <Pressable
                      onPress={onClearGif}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={styles.removeThumbButton}
                      accessibilityRole="button"
                      accessibilityLabel={t('comments.removeGif')}
                    >
                      <Icon name="close" size={18} color={Colors.neutral[50]} />
                    </Pressable>
                  ) : onClearAttachment ? (
                    <Pressable
                      onPress={onClearAttachment}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={styles.removeThumbButton}
                      accessibilityRole="button"
                      accessibilityLabel={t('comments.removeGif')}
                    >
                      <Icon name="close" size={18} color={Colors.neutral[50]} />
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {hasImages
                ? selectedImages.slice(0, 4).map(img => {
                    const ar =
                      img.aspectRatio && img.aspectRatio.height > 0
                        ? img.aspectRatio.width / img.aspectRatio.height
                        : 1;
                    return (
                      <View key={img.uri} style={[attachmentThumbWrapStyle, { aspectRatio: ar }]}>
                        <Image
                          source={{ uri: img.uri }}
                          style={attachmentThumbImageStyle}
                          contentFit="cover"
                        />
                        {onRemoveImage ? (
                          <Pressable
                            onPress={() => onRemoveImage(img.uri)}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            style={styles.removeThumbButton}
                            accessibilityRole="button"
                            accessibilityLabel={t('comments.removeImage')}
                          >
                            <Icon name="close" size={18} color={Colors.neutral[50]} />
                          </Pressable>
                        ) : null}
                      </View>
                    );
                  })
                : null}
            </ScrollView>
          </View>
        )}

        <View style={styles.inputRow}>
          {showAvatar ? (
            <View style={styles.avatarContainer}>
              <UI.Avatar
                uri={currentUserAvatar ?? undefined}
                type="profile"
                size={42}
                showRing={ringProps.showRing}
                ringColor={ringProps.ringColor}
                profileColors={ringProps.profileColors}
                style={styles.avatar}
                status={currentUserProfile?.status}
              />
            </View>
          ) : null}
          <View style={styles.inputWrapper}>
            <TextInput
              {...mentionInputProps}
              nativeID="comment-input"
              value={value}
              onChangeText={onChangeText}
              selection={inputSelection}
              onSelectionChange={onSelectionChange}
              style={styles.textInput}
              placeholder={resolvedPlaceholder}
              placeholderTextColor={Colors.neutral[500]}
              multiline
              editable={!isPosting}
              ref={inputRef}
              maxLength={maxLength + 25}
              keyboardType="default"
              returnKeyType="default"
              blurOnSubmit={false}
              autoComplete="off"
              textContentType="none"
              importantForAutofill="no"
              textAlignVertical="top"
              caretHidden={false}
              onFocus={onFocus}
            />
          </View>
          <View style={styles.sendColumn}>
            <View style={styles.controlsRow}>
              {canOpenMediaDrawer && !hasText && attachmentKind === 'none' ? (
                <MenuView
                  title=""
                  actions={mediaMenuActions}
                  onPressAction={handleMediaMenuPressAction}
                  shouldOpenOnLongPress={false}
                  themeVariant="dark"
                  isAnchoredToRight={true}
                >
                  <Pressable
                    style={[styles.addIconButton, isPosting && styles.iconButtonDisabled]}
                    disabled={isPosting || mediaMenuActions.length === 0}
                    hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                    accessible={true}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.add')}
                  >
                    <Icon name="add_circle" size={30} color={Colors.neutral[300]} />
                  </Pressable>
                </MenuView>
              ) : null}
              {shouldRenderSendButton ? (
                <Pressable
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
                </Pressable>
              ) : replyContext && !hasText ? (
                <Pressable
                  style={[styles.sendButton, styles.cancelReplyButton]}
                  onPress={onCancelReply}
                  hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityLabel={t('comments.cancelReply')}
                >
                  <Icon name="close" size={18} color={Colors.neutral[200]} />
                </Pressable>
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
      {userSearchModalProps && (
        <View style={styles.userSearchContainer} pointerEvents="box-none">
          <UserSearchModal {...userSearchModalProps} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  footerContainer: {
    backgroundColor: Colors.black,
    width: '100%',
  },
  inputContainer: COMPOSER_STYLES.container,
  inputRow: COMPOSER_STYLES.row,
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
    ...(Platform.OS === 'android' && { includeFontPadding: false }),
  },
  sendColumn: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: 8,
    alignSelf: 'center',
    position: 'relative',
    zIndex: 10,
    elevation: 10,
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
    fontFamily: Typography.families.medium,
    lineHeight: Typography.lineHeights.bodySmall,
  },
  charCountTextError: {
    color: Colors.coral[300],
    height: 84,
  },
  userSearchContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'box-none',
  },
  attachmentRow: {
    paddingBottom: 10,
  },
  attachmentStrip: {
    flexDirection: 'row',
    gap: 10,
    paddingRight: 2,
  },
  attachmentThumbWrap: {
    marginRight: 0,
    height: 72,
    maxWidth: 128,
    borderRadius: BORDER_RADIUS.SMALL,
    overflow: 'hidden',
    backgroundColor: Colors.transparent,
  },
  attachmentThumb: {
    width: '100%',
    height: '100%',
  },
  gifFallbackThumb: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.overlay.white10,
  },
  removeThumbButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: Colors.transparent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default memo(CommentInputFooter);
