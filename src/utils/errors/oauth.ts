import { logger } from '../logger';
import { TokenRevokedError, TokenRefreshError, TokenInvalidError } from '@atproto/oauth-client';

export interface OAuthErrorInfo {
  isUserCancellation: boolean;
  requiresReauth: boolean;
  isNetworkError: boolean;
  isRateLimit: boolean;
  isSessionExpired: boolean;
  userFriendlyMessage: string;
  shouldRedirectToLogin: boolean;
}

export function analyzeOAuthError(error: unknown): OAuthErrorInfo {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';

  const isTokenRevoked = error instanceof TokenRevokedError;
  const isTokenRefreshError = error instanceof TokenRefreshError;
  const isTokenInvalid = error instanceof TokenInvalidError;

  const isUserCancellation =
    errorMessage.includes('cancelled') ||
    errorMessage.includes('user_cancelled') ||
    errorMessage.includes('User cancelled') ||
    errorMessage.includes('Authentication cancelled');

  // Check for client metadata errors - these are network/config issues, not session expiration
  const isClientMetadataError =
    errorMessage.includes('invalid_client_metadata') ||
    errorMessage.includes('Unable to obtain client metadata') ||
    errorMessage.includes('Failed to load OAuth client configuration') ||
    errorMessage.includes('Failed to fetch client metadata');

  const isNetworkError =
    errorMessage.includes('Network') ||
    errorMessage.includes('fetch') ||
    errorMessage.includes('ENOTFOUND') ||
    errorMessage.includes('ETIMEDOUT') ||
    errorMessage.includes('network') ||
    errorMessage.includes('ECONNREFUSED') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('AbortError') ||
    isClientMetadataError; // Client metadata errors are network-related

  // Only require reauth for actual session/token issues, not network errors
  const requiresReauth =
    !isNetworkError && // Don't require reauth for network errors
    (isTokenRevoked ||
      isTokenRefreshError ||
      isTokenInvalid ||
      errorMessage.includes('oauth_reauth_required') ||
      errorMessage.includes('Session is invalid') ||
      errorMessage.includes('No session found') ||
      errorMessage.includes('Session expired') ||
      errorMessage.includes('deleted by another process'));

  const isRateLimit =
    errorMessage.includes('rate limit') ||
    errorMessage.includes('Rate Limit') ||
    errorMessage.includes('too many');

  // Session expired only if it's not a network error
  const isSessionExpired =
    !isNetworkError &&
    (requiresReauth || errorMessage.includes('token') || errorMessage.includes('expired'));

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

  if (errorInfo.isUserCancellation) {
    return;
  }

  if (errorInfo.shouldRedirectToLogin && onRedirectToLogin) {
    onRedirectToLogin();
    return;
  }

  logger.warn(`[OAuthErrorHandler] ${context} error`, {
    component: 'OAuthErrorHandler',
    action: context,
    userFriendlyMessage: errorInfo.userFriendlyMessage,
  });
}

export function createOAuthErrorHandler(context: string, onRedirectToLogin?: () => void) {
  return (error: unknown) => {
    handleOAuthError(error, context, onRedirectToLogin);
  };
}
