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
  const { currentUser } = useUserStore();
  const currentUserHandle = currentUser?.handle || null;
  const { data: currentUserProfile } = useProfile(currentUserHandle);
  const ringProps = useAvatarProfileRing(currentUser?.did ?? null);

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
                <View style={[styles.attachmentThumbWrap, { aspectRatio: 16 / 9 }]}>
                  {hasGifPreview ? (
                    <Image
                      source={{ uri: selectedGifPreviewUri ?? undefined }}
                      style={styles.attachmentThumb}
                      contentFit="contain"
                    />
                  ) : (
                    <View style={styles.gifFallbackThumb} />
                  )}
                  <View style={styles.attachmentBadge} pointerEvents="none">
                    <Text style={styles.attachmentBadgeText}>GIF</Text>
                  </View>
                  {onClearGif ? (
                    <Pressable
                      onPress={onClearGif}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={styles.removeThumbButton}
                      accessibilityRole="button"
                      accessibilityLabel={t('comments.removeGif')}
                    >
                      <Icon name="close" size={14} color={Colors.neutral[50]} />
                    </Pressable>
                  ) : onClearAttachment ? (
                    <Pressable
                      onPress={onClearAttachment}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={styles.removeThumbButton}
                      accessibilityRole="button"
                      accessibilityLabel={t('comments.removeGif')}
                    >
                      <Icon name="close" size={14} color={Colors.neutral[50]} />
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
                      <View key={img.uri} style={[styles.attachmentThumbWrap, { aspectRatio: ar }]}>
                        <Image
                          source={{ uri: img.uri }}
                          style={styles.attachmentThumb}
                          contentFit="contain"
                        />
                        {onRemoveImage ? (
                          <Pressable
                            onPress={() => onRemoveImage(img.uri)}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            style={styles.removeThumbButton}
                            accessibilityRole="button"
                            accessibilityLabel={t('comments.removeImage')}
                          >
                            <Icon name="close" size={14} color={Colors.neutral[50]} />
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
                    style={[styles.iconButton, isPosting && styles.iconButtonDisabled]}
                    disabled={isPosting || mediaMenuActions.length === 0}
                    hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                    accessible={true}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.add')}
                  >
                    <Icon name="plus" size={18} color={Colors.neutral[50]} />
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
                        <Icon name="arrow-up-fill" size={22} color={Colors.black} />
                      </View>
                    </>
                  ) : (
                    <Icon name="arrow-up-fill" size={22} color={Colors.black} />
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
    justifyContent: 'flex-start',
    marginLeft: 8,
    alignSelf: 'stretch',
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
  iconButton: COMPOSER_STYLES.addButton,
  iconButtonDisabled: {
    opacity: 0.6,
  },
  sendButton: [COMPOSER_STYLES.sendButton, { marginLeft: 0 }],
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
    borderRadius: BORDER_RADIUS.MEDIUM,
    overflow: 'hidden',
    backgroundColor: Colors.overlay.white10,
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
  attachmentBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.FULL,
    backgroundColor: Colors.overlay.black70,
  },
  attachmentBadgeText: {
    color: Colors.neutral[50],
    fontFamily: Typography.families.semibold,
    fontSize: Typography.sizes.caption,
    lineHeight: Typography.lineHeights.caption,
  },
  removeThumbButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: BORDER_RADIUS.FULL,
    backgroundColor: Colors.overlay.black70,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default memo(CommentInputFooter);
