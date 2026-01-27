import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable } from 'react-native';
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
import Icon, { Loading3FillIcon } from './Icon';

interface EmailVerificationModalProps {
  visible: boolean;
  onClose: () => void;
  name?: string;
}

export const EmailVerificationModal: React.FC<EmailVerificationModalProps> = ({
  visible,
  onClose,
  name = 'email-verification',
}) => {
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
  }, [error]);

  const shakeStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: shakeOffset.value }],
    };
  });

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
      setError('Authentication error. Please try logging in again.');
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
      const errorMessage = err instanceof Error ? err.message : 'Failed to send verification email';
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
      setError('Please enter the verification code from your email');
      return;
    }

    if (!agent) {
      setError('Authentication error. Please try logging in again.');
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      // Get user's email directly from session API
      const sessionResponse = await agent.api.com.atproto.server.getSession();
      const email = sessionResponse.data.email ?? null;
      if (!email) {
        throw new Error('Email not found. Please try logging in again.');
      }

      // API expects token WITH hyphen (format: "XXXXX-XXXXX")
      // Send token exactly as formatted (with hyphen)
      const trimmedToken = token.trim();

      // Validate token format (should be 11 characters with hyphen: "XXXXX-XXXXX")
      if (trimmedToken.length !== 11 || !trimmedToken.includes('-')) {
        setError(
          'Invalid verification code format. Please enter the code exactly as shown in your email (XXXXX-XXXXX).'
        );
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
      let errorMessage = 'Failed to verify email';
      if (err instanceof Error) {
        const errMsg = err.message;
        if (errMsg.includes('ExpiredToken')) {
          errorMessage = 'This verification code has expired. Please request a new one.';
        } else if (errMsg.includes('InvalidToken')) {
          errorMessage = 'Invalid verification code. Please check and try again.';
        } else if (errMsg.includes('InvalidEmail') || errMsg.includes('AccountNotFound')) {
          errorMessage = 'Invalid email address. Please try logging in again.';
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
      visible={visible}
      onDismiss={handleDismiss}
      title="Verify Your Email"
      showCancelButton={true}
      cancelButtonText="Skip for Now"
      name={name}
      scrollable={false}
      footerTopPadding={16}
    >
      <View style={[styles.container, { paddingBottom: 16 }]}>
        <Text style={styles.descriptionText}>
          {emailSent
            ? 'Enter the verification code sent to your email'
            : 'Please verify your email address to post videos.'}
        </Text>

        {emailSent ? (
          <View style={styles.tokenContainer}>
            <View style={styles.inputContainer}>
              <Icon name="mail" size={24} color={Colors.lightGray} style={styles.inputIcon} />
              <TextInput
                nativeID="email-verification-token-input"
                style={styles.input}
                placeholder="XXXXX-XXXXX"
                placeholderTextColor={Colors.gray}
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
                  <Icon name="close" size={24} color={Colors.red} style={styles.errorIcon} />
                </Animated.View>
              )}
            </View>

            <Pressable
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
                  <Loading3FillIcon size={24} color={Colors.white} style={{ marginRight: 8 }} />
                  <Text style={styles.verifyButtonText}>Verifying...</Text>
                </View>
              ) : (
                <View style={styles.buttonContentRow}>
                  <Text
                    style={[
                      styles.verifyButtonText,
                      token.trim().length === 11 && !error && styles.verifyButtonTextActive,
                    ]}
                  >
                    Verify Email
                  </Text>
                  <Icon
                    name="right_arrow_filled"
                    size={24}
                    color={
                      token.trim().length === 11 && !isVerifying && !error
                        ? Colors.darkGray
                        : Colors.gray
                    }
                  />
                </View>
              )}
            </Pressable>

            {cooldownSeconds === 0 && (
              <Pressable
                style={styles.resendButton}
                onPress={handleSendEmail}
                disabled={isVerifying || isSendingEmail}
              >
                <Text style={styles.resendButtonText}>
                  {isSendingEmail ? 'Sending...' : 'Request new code'}
                </Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={styles.infoContainer}>
            <Pressable
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
                  <Loading3FillIcon size={24} color={Colors.white} style={{ marginRight: 8 }} />
                  <Text style={styles.sendButtonText}>Sending...</Text>
                </View>
              ) : (
                <View style={styles.buttonContentRow}>
                  <Text style={styles.sendButtonText}>Send Code</Text>
                  <Icon name="right_arrow_filled" size={24} color={Colors.darkGray} />
                </View>
              )}
            </Pressable>

            <Text style={styles.infoText}>
              You&apos;ll receive a verification code in your email.
            </Text>
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
  descriptionText: {
    color: Colors.lightGray,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: 'Figtree-Regular',
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
    backgroundColor: Colors.white,
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
    fontSize: 20,
    height: '100%',
    fontFamily: 'Figtree-Medium',
    letterSpacing: 1,
  },
  sendButton: {
    backgroundColor: Colors.lightGray,
    borderRadius: BORDER_RADIUS.FULL,
    paddingVertical: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 64,
    flexDirection: 'row',
  },
  sendButtonActive: {
    backgroundColor: Colors.green,
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: Colors.darkGray,
    fontSize: 18,
    fontFamily: 'Figtree-SemiBold',
  },
  verifyButton: {
    backgroundColor: Colors.lightGray,
    borderRadius: BORDER_RADIUS.FULL,
    paddingVertical: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 64,
    flexDirection: 'row',
  },
  verifyButtonActive: {
    backgroundColor: Colors.green,
  },
  verifyButtonDisabled: {
    opacity: 0.6,
  },
  verifyButtonText: {
    color: Colors.gray,
    fontSize: 18,
    fontFamily: 'Figtree-SemiBold',
  },
  verifyButtonTextActive: {
    color: Colors.darkGray,
  },
  resendButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  resendButtonText: {
    color: Colors.lightGray,
    fontSize: 16,
    fontFamily: 'Figtree-Medium',
  },
  infoText: {
    color: Colors.lightGray,
    fontSize: 14,
    fontFamily: 'Figtree-Regular',
    lineHeight: 20,
    textAlign: 'center',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
});

export default EmailVerificationModal;
