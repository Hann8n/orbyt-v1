import React, { memo } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  Platform,
  type NativeSyntheticEvent,
  type TargetedEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Icon from '../../ui/Icon';
import UI from '../../ui/UI';
import { Colors } from '../../../theme';
import { BORDER_RADIUS } from '../../../utils/constants';
import { UserSearchModal } from '../../ui/usersearch';
import { useUserStore } from '../../../stores/userStore';
import { useProfile } from '../../../services/data/ProfileService';

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
}

const CommentInputFooter: React.FC<CommentInputFooterProps> = ({
  value,
  onChangeText,
  inputSelection,
  onSelectionChange,
  placeholder = 'Say something nice...',
  onSubmit,
  onCancelReply,
  replyContext,
  isPosting = false,
  maxLength = 300,
  inputRef,
  currentUserAvatar,
  userSearchModalProps,
  mentionInputProps,
  onFocus,
}) => {
  const charCount = value.length;
  const hasText = value.trim().length > 0;
  const showCharCount = charCount >= 150;
  const isSendDisabled = isPosting || !hasText || charCount > maxLength;
  const useLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

  // Get current user profile for live status
  const { currentUser } = useUserStore();
  const currentUserHandle = currentUser?.handle || null;
  const { data: currentUserProfile } = useProfile(currentUserHandle);

  // Get safe area insets for minimal bottom padding
  // TrueSheet handles keyboard positioning natively, so we only need minimal padding
  const insets = useSafeAreaInsets();
  // Use minimal padding - TrueSheet will handle keyboard offset automatically
  const bottomPadding = Platform.OS === 'ios' ? Math.min(8, insets.bottom) : 8;

  return (
    <View style={[styles.footerContainer, { paddingBottom: bottomPadding }]}>
      <View style={styles.inputContainer}>
        <View style={styles.inputRow}>
          <View style={styles.avatarContainer}>
            <UI.Avatar
              uri={currentUserAvatar ?? undefined}
              type="profile"
              size={42}
              style={styles.avatar}
              status={currentUserProfile?.status}
            />
          </View>
          <View style={styles.inputWrapper}>
            <TextInput
              {...mentionInputProps}
              nativeID="comment-input"
              value={value}
              onChangeText={onChangeText}
              selection={inputSelection}
              onSelectionChange={onSelectionChange}
              style={styles.textInput}
              placeholder={placeholder}
              placeholderTextColor={Colors.neutral[500]}
              multiline
              editable={!isPosting}
              ref={inputRef}
              maxLength={maxLength + 25}
              keyboardType="default"
              returnKeyType="send"
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
            {hasText && !isSendDisabled ? (
              <Pressable
                style={[styles.sendButton, !useLiquidGlass && styles.sendButtonFallback]}
                onPress={onSubmit}
                hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Send comment"
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
                accessibilityLabel="Cancel reply"
              >
                <Icon name="close" size={18} color={Colors.neutral[200]} />
              </Pressable>
            ) : null}
            {showCharCount && (
              <Text
                style={[
                  styles.charCountText,
                  styles.charCountBelow,
                  charCount > maxLength && styles.charCountTextError,
                ]}
              >
                {maxLength - charCount}
              </Text>
            )}
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
  inputContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: Colors.black,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
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
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.transparent,
    borderRadius: BORDER_RADIUS.LARGE,
    borderWidth: 0,
    borderColor: Colors.transparent,
    position: 'relative',
  },
  textInput: {
    backgroundColor: Colors.transparent,
    color: Colors.neutral[50],
    borderColor: Colors.transparent,
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    paddingRight: 0,
    paddingTop: 9,
    paddingBottom: 9,
    paddingLeft: 0,
    textAlignVertical: 'top',
    fontFamily: 'Figtree-Regular',
    fontSize: 18,
    lineHeight: 24,
  },
  sendColumn: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    zIndex: 10,
    elevation: 10,
  },
  sendButton: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignSelf: 'center',
    justifyContent: 'center',
    borderRadius: BORDER_RADIUS.FULL,
    width: 42,
    height: 42,
    alignItems: 'center',
    marginLeft: 8,
    marginTop: 0,
    zIndex: 11,
    elevation: 11,
    overflow: 'hidden',
  },
  sendButtonFallback: {
    backgroundColor: Colors.neutral[200],
  },
  glassBackground: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BORDER_RADIUS.FULL,
  },
  sendButtonContent: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelReplyButton: {
    backgroundColor: Colors.overlayWhite10,
  },
  charCountBelow: {
    marginTop: 6,
    color: Colors.neutral[200],
    fontSize: 11,
    textAlign: 'center',
    fontFamily: 'Figtree-Medium',
    width: 42,
    alignSelf: 'center',
  },
  charCountText: {
    color: Colors.neutral[200],
    fontSize: 11,
    textAlign: 'center',
    fontFamily: 'Figtree-Medium',
  },
  charCountTextError: {
    color: Colors.coral[300],
  },
  userSearchContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'box-none',
  },
});

export default memo(CommentInputFooter);
