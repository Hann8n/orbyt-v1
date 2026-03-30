import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { NativePressable } from './NativePressable';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useUserStore } from '../../stores/userStore';
import { EmailVerificationService } from '../../services/auth/EmailVerificationService';
import VerticalListSheet from './VerticalListSheet';
import { Colors } from './UI';
import { BORDER_RADIUS, APP_CONSTANTS } from '../../utils/constants';
import { logger } from '../../utils/logger';
import Icon from './Icon';
import { FontFamily, Typography } from '../../utils/components/typography';
import { useSheetPresentation } from '../../hooks';

interface EmailVerificationModalProps {
  visible: boolean;
  onClose: () => void;
}

export const EmailVerificationModal: React.FC<EmailVerificationModalProps> = ({
  visible,
  onClose,
}) => {
  const { t } = useTranslation();
  const agent = useUserStore(state => state.agent);

  const [token, setToken] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Shake animation for error icon
  const shakeOffset = useSharedValue(0);

  // Cooldown timer for request new code button
  useEffect(() => {
    if (cooldownSeconds <= 0) {
      return;
    }

    const timer = setTimeout(() => {
      setCooldownSeconds(cooldownSeconds - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [cooldownSeconds]);

  useEffect(() => {
    if (error) {
      // Trigger shake animation when error is set
      shakeOffset.value = withSequence(
        withTiming(-3, { duration: 50 }),
        withTiming(3, { duration: 50 }),
        withTiming(-2, { duration: 50 }),
        withTiming(2, { duration: 50 }),
        withTiming(0, { duration: 50 })
      );
    }
  }, [error, shakeOffset]);

  const shakeStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: shakeOffset.value }],
    };
  });

  useSheetPresentation(visible, 'email-verification-sheet');

  // Format token as "XXXXX-XXXXX" (uppercase, alphanumeric only)
  const formatToken = (text: string): string => {
    // Remove all non-alphanumeric characters (hyphens, spaces, etc.)
    const cleaned = text.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

    // Limit to 10 characters (5 + 5)
    const limited = cleaned.slice(0, 10);

    // Add hyphen after 5 characters if we have more than 5 characters
    if (limited.length <= 5) {
      return limited;
    }
    // Format as "XXXXX-XXXXX"
    return `${limited.slice(0, 5)}-${limited.slice(5)}`;
  };

  const handleSendEmail = async () => {
    if (!agent) {
      setError(t('auth.authErrorLoginAgain'));
      return;
    }

    if (cooldownSeconds > 0) {
      return; // Prevent sending during cooldown
    }

    setIsSendingEmail(true);
    setError(null);
    setToken(''); // Clear token when requesting new code

    try {
      await EmailVerificationService.requestEmailConfirmation(agent);
      setEmailSent(true);
      setCooldownSeconds(90); // Start 90 second cooldown
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : t('auth.failedToSendVerificationEmail');
      setError(errorMessage);
      logger.error('Failed to send email verification', err, {
        component: 'EmailVerificationModal',
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleVerifyToken = async () => {
    if (!token.trim()) {
      setError(t('auth.pleaseEnterVerificationCode'));
      return;
    }

    if (!agent) {
      setError(t('auth.authErrorLoginAgain'));
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      // Get user's email directly from session API
      const sessionResponse = await agent.api.com.atproto.server.getSession();
      const email = sessionResponse.data.email ?? null;
      if (!email) {
        throw new Error(t('auth.emailNotFound'));
      }

      // API expects token WITH hyphen (format: "XXXXX-XXXXX")
      // Send token exactly as formatted (with hyphen)
      const trimmedToken = token.trim();

      // Validate token format (should be 11 characters with hyphen: "XXXXX-XXXXX")
      if (trimmedToken.length !== 11 || !trimmedToken.includes('-')) {
        setError(t('auth.invalidVerificationFormat'));
        setIsVerifying(false);
        return;
      }

      // Log for debugging
      logger.debug('Verifying email token', {
        component: 'EmailVerificationModal',
        token: trimmedToken,
        tokenLength: trimmedToken.length,
      });

      // Send token with hyphen (API expects this format)
      await EmailVerificationService.confirmEmail(agent, email, trimmedToken);

      // Refresh verification status directly from session API
      // Use API field name directly: emailConfirmed (not emailVerified)
      const refreshedSession = await agent.api.com.atproto.server.getSession();
      const emailConfirmed = refreshedSession.data.emailConfirmed;

      // Update state with refreshed verification status
      // Use Zustand's setState which automatically triggers subscriptions/rerenders
      useUserStore.setState(state => {
        if (state.currentUser) {
          return {
            currentUser: { ...state.currentUser, emailConfirmed },
          };
        }
        return state;
      });

      // Reset form state
      setToken('');
      setEmailSent(false);

      // Use requestIdleCallback to ensure state update propagates before closing modal
      // This ensures route guards and other components see the updated emailConfirmed status
      requestIdleCallback(
        () => {
          // Close modal after React has processed the state update
          // This gives route guards time to re-evaluate with the new state
          onClose();
        },
        { timeout: APP_CONSTANTS.IDLE_CALLBACK_TIMEOUT }
      );
    } catch (err) {
      // Handle specific error types from the API
      let errorMessage = t('auth.failedToVerifyEmail');
      if (err instanceof Error) {
        const errMsg = err.message;
        if (errMsg.includes('ExpiredToken')) {
          errorMessage = t('auth.verificationCodeExpired');
        } else if (errMsg.includes('InvalidToken')) {
          errorMessage = t('auth.invalidVerificationCode');
        } else if (errMsg.includes('InvalidEmail') || errMsg.includes('AccountNotFound')) {
          errorMessage = t('auth.invalidEmailLoginAgain');
        } else {
          errorMessage = errMsg;
        }
      }

      setError(errorMessage);
      logger.error('Failed to verify email', err, {
        component: 'EmailVerificationModal',
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDismiss = () => {
    setToken('');
    setEmailSent(false);
    setError(null);
    onClose();
  };

  return (
    <VerticalListSheet
      name="email-verification-sheet"
      onDismiss={handleDismiss}
      title={t('auth.verifyEmail')}
      showCancelButton={true}
      cancelButtonText={t('auth.skipForNow')}
      scrollable={false}
    >
      <View style={[styles.container, styles.containerBottomPadding]}>
        <Text style={styles.descriptionText}>
          {emailSent ? t('auth.enterVerificationCode') : t('auth.pleaseVerifyEmail')}
        </Text>

        {emailSent ? (
          <View style={styles.tokenContainer}>
            <View style={styles.inputContainer}>
              <Icon name="mail" size={24} color={Colors.neutral[200]} style={styles.inputIcon} />
              <TextInput
                nativeID="email-verification-token-input"
                style={styles.input}
                placeholder={t('auth.verificationCodePlaceholder')}
                placeholderTextColor={Colors.neutral[500]}
                value={token}
                onChangeText={text => {
                  const formatted = formatToken(text);
                  setToken(formatted);
                  setError(null);
                }}
                autoCapitalize="characters"
                autoCorrect={false}
                keyboardType="default"
                editable={!isVerifying}
                maxLength={11}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleVerifyToken}
              />
              {error && (
                <Animated.View style={shakeStyle}>
                  <Icon name="close" size={24} color={Colors.coral[500]} style={styles.errorIcon} />
                </Animated.View>
              )}
            </View>

            <NativePressable
              style={[
                styles.verifyButton,
                token.trim().length === 11 && !isVerifying && !error && styles.verifyButtonActive,
                (isVerifying || token.trim().length !== 11 || !!error) &&
                  styles.verifyButtonDisabled,
              ]}
              onPress={handleVerifyToken}
              disabled={token.trim().length !== 11 || isVerifying || !!error}
            >
              {isVerifying ? (
                <View style={styles.buttonContent}>
                  <ActivityIndicator
                    size="small"
                    color={Colors.neutral[50]}
                    style={styles.buttonSpinner}
                  />
                  <Text style={styles.verifyButtonText}>{t('auth.verifying')}</Text>
                </View>
              ) : (
                <View style={styles.buttonContentRow}>
                  <Text
                    style={[
                      styles.verifyButtonText,
                      token.trim().length === 11 && !error && styles.verifyButtonTextActive,
                    ]}
                  >
                    {t('auth.verify')}
                  </Text>
                  <Icon
                    name="arrow_right"
                    size={24}
                    color={
                      token.trim().length === 11 && !isVerifying && !error
                        ? Colors.neutral[900]
                        : Colors.neutral[500]
                    }
                  />
                </View>
              )}
            </NativePressable>

            {cooldownSeconds === 0 && (
              <NativePressable
                style={styles.resendButton}
                onPress={handleSendEmail}
                disabled={isVerifying || isSendingEmail}
              >
                <Text style={styles.resendButtonText}>
                  {isSendingEmail ? t('auth.sending') : t('auth.requestNewCode')}
                </Text>
              </NativePressable>
            )}
          </View>
        ) : (
          <View style={styles.infoContainer}>
            <NativePressable
              style={[
                styles.sendButton,
                !isSendingEmail && styles.sendButtonActive,
                isSendingEmail && styles.sendButtonDisabled,
              ]}
              onPress={handleSendEmail}
              disabled={isSendingEmail}
            >
              {isSendingEmail ? (
                <View style={styles.buttonContent}>
                  <ActivityIndicator
                    size="small"
                    color={Colors.neutral[50]}
                    style={styles.buttonSpinner}
                  />
                  <Text style={styles.sendButtonText}>{t('auth.sending')}</Text>
                </View>
              ) : (
                <View style={styles.buttonContentRow}>
                  <Text style={styles.sendButtonText}>{t('auth.sendCodeButton')}</Text>
                  <Icon name="arrow_right" size={24} color={Colors.neutral[900]} />
                </View>
              )}
            </NativePressable>

            <Text style={styles.infoText}>{t('auth.youllReceiveCode')}</Text>
          </View>
        )}
      </View>
    </VerticalListSheet>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
  },
  containerBottomPadding: {
    paddingBottom: 16,
  },
  descriptionText: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.body,
    lineHeight: Typography.lineHeights.body,
    fontFamily: FontFamily.regular,
    marginBottom: 16,
    marginTop: 4,
  },
  errorIcon: {
    marginLeft: 12,
  },
  tokenContainer: {
    gap: 12,
  },
  infoContainer: {
    gap: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.neutral[50],
    borderRadius: BORDER_RADIUS.FULL,
    marginBottom: 4,
    paddingHorizontal: 20,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: Colors.black,
    fontSize: Typography.sizes.h3,
    lineHeight: Typography.lineHeights.h3,
    height: '100%',
    fontFamily: FontFamily.medium,
    letterSpacing: 1,
  },
  sendButton: {
    backgroundColor: Colors.neutral[200],
    borderRadius: BORDER_RADIUS.FULL,
    paddingVertical: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 64,
    flexDirection: 'row',
  },
  sendButtonActive: {
    backgroundColor: Colors.teal[500],
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: Colors.neutral[900],
    fontSize: Typography.sizes.title,
    lineHeight: Typography.lineHeights.title,
    fontFamily: FontFamily.semibold,
  },
  verifyButton: {
    backgroundColor: Colors.neutral[200],
    borderRadius: BORDER_RADIUS.FULL,
    paddingVertical: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 64,
    flexDirection: 'row',
  },
  verifyButtonActive: {
    backgroundColor: Colors.teal[500],
  },
  verifyButtonDisabled: {
    opacity: 0.6,
  },
  verifyButtonText: {
    color: Colors.neutral[500],
    fontSize: Typography.sizes.title,
    lineHeight: Typography.lineHeights.title,
    fontFamily: FontFamily.semibold,
  },
  verifyButtonTextActive: {
    color: Colors.neutral[900],
  },
  resendButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  resendButtonText: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.body,
    lineHeight: Typography.lineHeights.body,
    fontFamily: FontFamily.medium,
  },
  infoText: {
    color: Colors.neutral[200],
    fontSize: Typography.sizes.bodySmall,
    fontFamily: FontFamily.regular,
    lineHeight: Typography.lineHeights.bodySmall,
    textAlign: 'center',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSpinner: {
    marginRight: 8,
  },
  buttonContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
});
