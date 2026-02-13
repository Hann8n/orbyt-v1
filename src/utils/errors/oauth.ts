import { TokenRevokedError, TokenRefreshError, TokenInvalidError } from '@atproto/oauth-client';

/**
 * Check if the error indicates the session needs re-authentication.
 * Uses @atproto/oauth-client's typed errors - trust the library's implementation.
 */
export function requiresReauth(error: unknown): boolean {
  return (
    error instanceof TokenRevokedError ||
    error instanceof TokenRefreshError ||
    error instanceof TokenInvalidError
  );
}
