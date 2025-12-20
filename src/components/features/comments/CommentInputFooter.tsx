import React, { memo } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, Platform } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Icon from '../../ui/Icon';
import UI from '../../ui/UI';
import { Colors } from '../../ui/UI';
import { BORDER_RADIUS } from '../../../utils/constants';
import { UserSearchModal } from '../../ui/usersearch';

interface CommentInputFooterProps {
  value: string;
  onChangeText: (text: string) => void;
  inputSelection: { start: number; end: number };
  onSelectionChange: (e: any) => void;
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
  inputRef?: React.RefObject<TextInput>;
  currentUserAvatar?: string | null;
  userSearchModalProps?: any;
  mentionInputProps?: any;
  onFocus?: () => void;
  onBlur?: () => void;
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
  onBlur,
}) => {
  const charCount = value.length;
  const hasText = value.trim().length > 0;
  const showCharCount = charCount >= 150;
  const isSendDisabled = isPosting || !hasText || charCount > maxLength;
  const useLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

  return (
    <View style={styles.footerContainer}>
      <View style={styles.inputContainer}>
        <View style={styles.inputRow}>
          <View style={styles.avatarContainer}>
            <UI.Avatar
              uri={currentUserAvatar}
              type="profile"
              size={42}
              style={styles.avatar}
            />
          </View>
          <View style={styles.inputWrapper}>
            <TextInput
              {...mentionInputProps}
              value={value}
              onChangeText={onChangeText}
              selection={inputSelection}
              onSelectionChange={onSelectionChange}
              style={styles.textInput}
              placeholder={placeholder}
              placeholderTextColor={Colors.gray}
              multiline
              editable={!isPosting}
              ref={inputRef}
              maxLength={maxLength + 25}
              keyboardType="default"
              returnKeyType="default"
              blurOnSubmit={false}
              autoCorrect={true}
              autoCapitalize="sentences"
              textAlignVertical="top"
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </View>
          <View style={styles.sendColumn}>
            {replyContext ? (
              <>
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
                          <Icon 
                            name="arrow-up-fill"
                            size={22}
                            color={Colors.black}
                          />
                        </View>
                      </>
                    ) : (
                      <Icon 
                        name="arrow-up-fill"
                        size={22}
                        color={Colors.black}
                      />
                    )}
                  </Pressable>
                ) : !hasText ? (
                  <Pressable
                    style={[styles.sendButton, styles.cancelReplyButton]}
                    onPress={onCancelReply}
                    hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                    accessible={true}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel reply"
                  >
                    <Icon 
                      name="close"
                      size={18}
                      color={Colors.lightGray}
                    />
                  </Pressable>
                ) : null}
              </>
            ) : (
              <>
                {hasText && !isSendDisabled && (
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
                          <Icon 
                            name="arrow-up-fill" 
                            size={22} 
                            color={Colors.black}
                          />
                        </View>
                      </>
                    ) : (
                      <Icon 
                        name="arrow-up-fill" 
                        size={22} 
                        color={Colors.black}
                      />
                    )}
                  </Pressable>
                )}
              </>
            )}
            {showCharCount && (
              <Text style={[
                styles.charCountText,
                styles.charCountBelow,
                charCount > maxLength && styles.charCountTextError
              ]}>
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
    paddingBottom: 8,
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
    backgroundColor: 'transparent',
    borderRadius: BORDER_RADIUS.LARGE,
    borderWidth: 0,
    borderColor: 'transparent',
    position: 'relative',
  },
  textInput: {
    backgroundColor: 'transparent',
    color: Colors.white,
    borderColor: 'transparent',
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    paddingRight: 0,
    paddingTop: 9,
    paddingBottom: 9,
    paddingLeft: 0,
    textAlignVertical: 'top',
    fontFamily: 'Firma-Regular',
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
    backgroundColor: Colors.lightGray,
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
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  charCountBelow: {
    marginTop: 6,
    color: Colors.lightGray,
    fontSize: 11,
    textAlign: 'center',
    fontFamily: 'Firma-Medium',
    width: 42,
    alignSelf: 'center',
  },
  charCountText: {
    color: Colors.lightGray,
    fontSize: 11,
    textAlign: 'center',
    fontFamily: 'Firma-Medium',
  },
  charCountTextError: {
    color: Colors.lightRed,
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

