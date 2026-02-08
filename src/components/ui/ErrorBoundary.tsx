/**
 * Error Boundary Component
 *
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI instead of crashing.
 *
 * Modern implementation for React Native 2025 with React Query integration support.
 *
 * Note: Error boundaries must be class components (React limitation).
 * They catch errors in:
 * - Render methods
 * - Lifecycle methods
 * - Constructors of the whole tree below them
 *
 * They do NOT catch errors in:
 * - Event handlers (use try/catch)
 * - Async code (use try/catch or React Query error handling)
 * - Server-side rendering
 * - Errors thrown in the error boundary itself
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, Linking, Pressable, Alert, Platform } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { logger } from '../../utils/logger';
import { Colors, RetryButton } from './UI';
import { BORDER_RADIUS } from '../../utils/constants';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { GlassView } from 'expo-glass-effect';
import { getDeviceInfo } from '../../utils/version';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, resetError: () => void) => ReactNode);
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onReset?: () => void;
  resetKeys?: Array<string | number>;
  level?: 'root' | 'feature' | 'component';
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Base Error Boundary Component
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary level="feature" onReset={handleReset}>
 *   <YourComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private resetTimeoutId: NodeJS.Timeout | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to our centralized logger
    logger.error('ErrorBoundary caught error', error, {
      component: 'ErrorBoundary',
      level: this.props.level || 'component',
      errorInfo: errorInfo.componentStack,
    });

    // Store error info for potential display
    this.setState({
      errorInfo,
    });

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);

    // In production, you might want to send to error tracking service
    // Example: Sentry.captureException(error, { extra: errorInfo });
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    // Reset error boundary when resetKeys change
    const { resetKeys } = this.props;
    if (
      resetKeys &&
      prevProps.resetKeys &&
      resetKeys.length === prevProps.resetKeys.length &&
      resetKeys.some((key, index) => prevProps.resetKeys![index] !== key)
    ) {
      this.resetErrorBoundary();
    }
  }

  componentWillUnmount() {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
    }
  }

  resetErrorBoundary = () => {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
    }

    // Call onReset callback if provided
    this.props.onReset?.();

    // Reset state after a brief delay to ensure cleanup
    this.resetTimeoutId = setTimeout(() => {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
      });
    }, 100);
  };

  render() {
    if (this.state.hasError && this.state.error) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        if (typeof this.props.fallback === 'function') {
          return this.props.fallback(this.state.error, this.resetErrorBoundary);
        }
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <ErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          onReset={this.resetErrorBoundary}
          level={this.props.level}
        />
      );
    }

    return this.props.children;
  }
}

/**
 * Default Error Fallback UI Component
 */
interface ErrorFallbackProps {
  error: Error;
  errorInfo: ErrorInfo | null;
  onReset: () => void;
  level?: 'root' | 'feature' | 'component';
}

// Go Back Button Component - matches RetryButton styling
const GoBackButton: React.FC<{ onPress: () => void }> = ({ onPress }) => {
  const useLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

  const buttonContent = (
    <View style={goBackButtonStyles.buttonContent} pointerEvents="none">
      <Text style={[goBackButtonStyles.text]} pointerEvents="none">
        Go Back
      </Text>
    </View>
  );

  return (
    <Pressable
      style={[goBackButtonStyles.button, !useLiquidGlass && goBackButtonStyles.whiteButton]}
      onPress={onPress}
    >
      {useLiquidGlass ? (
        <>
          <GlassView
            style={goBackButtonStyles.glassBackground}
            glassEffectStyle="clear"
            tintColor="rgba(255, 255, 255, 1)"
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

const goBackButtonStyles = StyleSheet.create({
  button: {
    borderRadius: BORDER_RADIUS.FULL,
    paddingVertical: 12,
    paddingHorizontal: 24,
    overflow: 'hidden',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 44,
    marginTop: 20,
  },
  buttonContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  whiteButton: {
    backgroundColor: Colors.neutral[50],
  },
  glassBackground: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BORDER_RADIUS.FULL,
  },
  text: {
    color: Colors.black,
    fontSize: 16,
    fontFamily: 'Figtree-SemiBold',
  },
});

const ErrorFallback: React.FC<ErrorFallbackProps> = ({
  error,
  errorInfo: _errorInfo,
  onReset,
  level = 'component',
}) => {
  const router = useRouter();
  const segments = useSegments();

  // Check if we can go back (not at root)
  const canGoBack = segments.length > 0 && !(segments.length === 1 && segments[0] === '(tabs)');
  const getTitle = () => {
    return 'Something went wrong';
  };

  const getMessage = () => {
    switch (level) {
      case 'root':
        return 'The app encountered an unexpected error. Please try restarting the app.';
      case 'feature':
        return "We couldn't load this feature.";
      case 'component':
        return 'This component encountered an error. Please try again.';
      default:
        return 'An unexpected error occurred. Please try again.';
    }
  };

  const getEmailBody = async () => {
    const deviceInfo = await getDeviceInfo();
    const errorMessage = error?.message || 'Unknown error';

    return `



----------------------------------------
Error Message (do not edit below this line):
${errorMessage}

----------------------------------------
Device Information:
${deviceInfo}`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.emoji}>:(</Text>
        <Text style={styles.title}>{getTitle()}</Text>
        <Text style={styles.message}>{getMessage()}</Text>

        <Pressable
          onPress={async () => {
            const email = 'support@getorbyt.com';
            const subject = encodeURIComponent('orbyt app error report');
            let emailBody: string;

            try {
              emailBody = await getEmailBody();
            } catch (error) {
              logger.error('Error building error report email body', error, {
                component: 'ErrorBoundary',
              });

              // Still allow reporting if device info retrieval fails.
              const errorMessage = error instanceof Error ? error.message : String(error);
              emailBody = `



----------------------------------------
Error Message (do not edit below this line):
${errorMessage}

----------------------------------------
Device Information:
Unavailable (failed to retrieve)`;
            }

            const body = encodeURIComponent(emailBody);
            const mailtoUrl = `mailto:${email}?subject=${subject}&body=${body}`;

            try {
              const canOpen = await Linking.canOpenURL(`mailto:${email}`);
              if (canOpen) {
                await Linking.openURL(mailtoUrl);
              } else {
                // Fallback: Copy email body to clipboard and show alert
                await Clipboard.setStringAsync(`${email}\n\n${emailBody}`);
                Alert.alert(
                  'Email Copied',
                  `No email app is configured. The support email and error details have been copied to your clipboard.`,
                  [{ text: 'OK' }]
                );
              }
            } catch (error) {
              logger.error('Error opening email', error, { component: 'ErrorBoundary' });
              // Fallback: Copy email body to clipboard
              try {
                await Clipboard.setStringAsync(`${email}\n\n${emailBody}`);
                Alert.alert(
                  'Email Copied',
                  `Unable to open email app. The support email and error details have been copied to your clipboard.`,
                  [{ text: 'OK' }]
                );
              } catch (_clipboardError) {
                Alert.alert(
                  'Contact Support',
                  `Please email us at ${email} with the error details.`,
                  [{ text: 'OK' }]
                );
              }
            }
          }}
          style={styles.supportLink}
        >
          <Text style={styles.supportLinkText}>Contact support</Text>
        </Pressable>
      </View>

      <View style={styles.buttonContainer}>
        <View style={styles.actionButtonsContainer}>
          {canGoBack && (
            <View style={styles.buttonWrapper}>
              <GoBackButton onPress={() => router.back()} />
            </View>
          )}
          <View style={styles.buttonWrapper}>
            <RetryButton onPress={onReset} />
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
    justifyContent: 'space-between',
  },
  content: {
    alignItems: 'flex-start',
    maxWidth: 400,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: 120,
    flex: 1,
  },
  emoji: {
    fontSize: 32,
    fontFamily: 'Figtree-SemiBold',
    color: Colors.neutral[50],
    textAlign: 'left',
    marginBottom: 8,
    lineHeight: 40,
  },
  title: {
    fontSize: 32,
    fontFamily: 'Figtree-SemiBold',
    color: Colors.neutral[50],
    textAlign: 'left',
    marginBottom: 12,
    lineHeight: 40,
    letterSpacing: 0.15,
  },
  message: {
    fontSize: 16,
    fontFamily: 'Figtree-Regular',
    color: Colors.neutral[500],
    textAlign: 'left',
    marginBottom: 24,
    lineHeight: 24,
  },
  buttonContainer: {
    width: '100%',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 50,
    maxWidth: 400,
    alignSelf: 'center',
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
    marginTop: 0,
  },
  buttonWrapper: {
    flex: 1,
  },
  supportLink: {
    paddingVertical: 8,
    paddingHorizontal: 0,
    alignSelf: 'flex-start',
    marginTop: 0,
  },
  supportLinkText: {
    fontSize: 16,
    fontFamily: 'Figtree-SemiBold',
    color: Colors.neutral[200],
    textAlign: 'left',
    textDecorationLine: 'underline',
  },
});

export default ErrorBoundary;
