/**
 * Universal OAuth Error Handler
 * Provides consistent error handling for OAuth authentication failures
 */
import { logger } from '../logger';

export interface OAuthErrorInfo {
  isUserCancellation: boolean;
  requiresReauth: boolean;
  isNetworkError: boolean;
  isRateLimit: boolean;
  isSessionExpired: boolean;
  userFriendlyMessage: string;
  shouldRedirectToLogin: boolean;
}

/**
 * Analyzes OAuth errors and provides actionable information
 */
export function analyzeOAuthError(error: unknown): OAuthErrorInfo {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';

  const isUserCancellation =
    errorMessage.includes('cancelled') ||
    errorMessage.includes('user_cancelled') ||
    errorMessage.includes('User cancelled');

  const requiresReauth =
    errorMessage.includes('oauth_reauth_required') ||
    errorMessage.includes('Session is invalid') ||
    errorMessage.includes('No session found') ||
    errorMessage.includes('Session expired') ||
    errorMessage.includes('deleted by another process') ||
    errorMessage.includes('TokenRefreshError');

  const isNetworkError =
    errorMessage.includes('Network') ||
    errorMessage.includes('fetch') ||
    errorMessage.includes('ENOTFOUND') ||
    errorMessage.includes('ETIMEDOUT') ||
    errorMessage.includes('network');

  const isRateLimit =
    errorMessage.includes('rate limit') ||
    errorMessage.includes('Rate Limit') ||
    errorMessage.includes('too many');

  const isSessionExpired =
    requiresReauth || errorMessage.includes('token') || errorMessage.includes('expired');

  // Determine user-friendly message
  let userFriendlyMessage = 'Authentication failed. Please try again.';

  if (isUserCancellation) {
    userFriendlyMessage = 'Sign-in was cancelled.';
  } else if (requiresReauth) {
    userFriendlyMessage = 'Your session has expired. Please sign in again.';
  } else if (isNetworkError) {
    userFriendlyMessage = 'Network error. Please check your connection and try again.';
  } else if (isRateLimit) {
    userFriendlyMessage = 'Too many attempts. Please wait a few minutes and try again.';
  } else if (isSessionExpired) {
    userFriendlyMessage = 'Your session has expired. Please sign in again.';
  }

  return {
    isUserCancellation,
    requiresReauth,
    isNetworkError,
    isRateLimit,
    isSessionExpired,
    userFriendlyMessage,
    shouldRedirectToLogin: requiresReauth || isSessionExpired,
  };
}

/**
 * Handles OAuth errors with appropriate user feedback
 */
export function handleOAuthError(
  error: unknown,
  context: string = 'authentication',
  onRedirectToLogin?: () => void
): void {
  const errorInfo = analyzeOAuthError(error);

  logger.error(`[OAuthErrorHandler] ${context} failed`, error, {
    component: 'OAuthErrorHandler',
    action: context,
    errorInfo,
  });

  // Don't show alerts for user cancellations
  if (errorInfo.isUserCancellation) {
    return;
  }

  // For session expiration, redirect to login if callback provided
  if (errorInfo.shouldRedirectToLogin && onRedirectToLogin) {
    onRedirectToLogin();
    return;
  }

  // For other errors, you might want to show an alert or handle differently
  // This is a generic handler - specific components should implement their own UI
  logger.warn(`[OAuthErrorHandler] ${context} error`, {
    component: 'OAuthErrorHandler',
    action: context,
    userFriendlyMessage: errorInfo.userFriendlyMessage,
  });
}

/**
 * Creates a standardized error handler for OAuth operations
 */
export function createOAuthErrorHandler(context: string, onRedirectToLogin?: () => void) {
  return (error: unknown) => {
    handleOAuthError(error, context, onRedirectToLogin);
  };
}
