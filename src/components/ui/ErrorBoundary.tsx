/**
 * Error boundary: catches render/lifecycle errors in the tree and shows fallback UI.
 * Must be a class component (React limitation).
 */

import React, { Component, ErrorInfo, ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet, Linking, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativePressable } from './NativePressable';
import {
  useRouter,
  useSegments,
  type ErrorBoundaryProps as RouteErrorBoundaryProps,
} from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { logger } from '../../utils/logger';
import { Colors } from './UI';
import CancelButton from './CancelButton';
import { getDeviceInfo } from '../../utils/version';
import { FontFamily, Typography, TextStyles } from '../../utils/components/typography';

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
  private resetTimeoutId: ReturnType<typeof setTimeout> | null = null;

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
 * Fallback for Expo Router's per-route `ErrorBoundary` export. Exported from each tab's layout so
 * a render crash replaces only that tab's stack, keeping the tab bar and other tabs' history.
 */
export function RouteErrorBoundary({ error, retry }: RouteErrorBoundaryProps) {
  useEffect(() => {
    logger.error('Route ErrorBoundary caught error', error, {
      component: 'ErrorBoundary',
      level: 'feature',
    });
  }, [error]);

  return (
    <ErrorFallback error={error} errorInfo={null} onReset={() => void retry()} level="feature" />
  );
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

const ErrorFallback: React.FC<ErrorFallbackProps> = ({
  error,
  errorInfo: _errorInfo,
  onReset,
  level = 'component',
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();

  // Check if we can go back (not at root)
  const canGoBack = segments.length > 0 && !(segments.length === 1 && segments[0] === '(tabs)');
  const getTitle = () => {
    return t('errors.somethingWentWrong');
  };

  const getMessage = () => {
    switch (level) {
      case 'root':
        return t('errors.appEncounteredError');
      case 'feature':
        return t('errors.couldNotLoadFeature');
      case 'component':
        return t('errors.componentError');
      default:
        return t('errors.unexpected');
    }
  };

  const getEmailBody = async () => {
    const deviceInfo = await getDeviceInfo();
    const errorMessage = error?.message || t('errors.unknown');

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

        <NativePressable
          onPress={async () => {
            const email = 'support@getorbyt.com';
            const subject = encodeURIComponent(t('errors.emailSubjectErrorReport'));
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
${t('errors.deviceInfoUnavailable')}`;
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
                Alert.alert(t('settings.emailCopied'), t('errors.emailCopiedNoApp'), [
                  { text: t('common.ok') },
                ]);
              }
            } catch (error) {
              logger.error('Error opening email', error, { component: 'ErrorBoundary' });
              // Fallback: Copy email body to clipboard
              try {
                await Clipboard.setStringAsync(`${email}\n\n${emailBody}`);
                Alert.alert(t('settings.emailCopied'), t('errors.emailCopiedUnableToOpen'), [
                  { text: t('common.ok') },
                ]);
              } catch (_clipboardError) {
                Alert.alert(
                  t('errors.contactSupport'),
                  t('errors.contactSupportMessage', { email }),
                  [{ text: t('common.ok') }]
                );
              }
            }
          }}
          style={styles.supportLink}
        >
          <Text style={styles.supportLinkText}>{t('errors.contactSupportLink')}</Text>
        </NativePressable>
      </View>

      <View style={[styles.buttonContainer, { paddingBottom: Math.max(insets.bottom, 12) + 16 }]}>
        <CancelButton
          onPress={onReset}
          text={t('errors.tryAgain')}
          variant="primary"
          style={styles.fullWidthAction}
        />
        {canGoBack ? (
          <CancelButton
            onPress={() => router.back()}
            text={t('common.goBack')}
            variant="default"
            style={styles.fullWidthAction}
          />
        ) : null}
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
    paddingHorizontal: 24,
    paddingTop: 120,
    flex: 1,
  },
  emoji: {
    ...TextStyles.displayLarge,
    color: Colors.neutral[50],
    textAlign: 'left',
    marginBottom: 8,
  },
  title: {
    ...TextStyles.displayLarge,
    color: Colors.neutral[50],
    textAlign: 'left',
    marginBottom: 12,
    letterSpacing: 0.15,
  },
  message: {
    fontSize: Typography.sizes.subtitle,
    fontFamily: FontFamily.regular,
    color: Colors.neutral[500],
    textAlign: 'left',
    marginBottom: 24,
    lineHeight: Typography.lineHeights.subtitle,
  },
  buttonContainer: {
    width: '100%',
    alignItems: 'stretch',
    paddingHorizontal: 24,
    paddingTop: 16,
    maxWidth: 400,
    alignSelf: 'center',
    gap: 12,
  },
  fullWidthAction: {
    alignSelf: 'stretch',
    width: '100%',
  },
  supportLink: {
    paddingVertical: 8,
    paddingHorizontal: 0,
    alignSelf: 'flex-start',
    marginTop: 0,
  },
  supportLinkText: {
    fontSize: Typography.sizes.subtitle,
    fontFamily: FontFamily.semibold,
    color: Colors.neutral[200],
    textAlign: 'left',
    textDecorationLine: 'underline',
  },
});
