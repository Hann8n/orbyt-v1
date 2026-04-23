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

/**
 * Check if the error is a missing OAuth scope error.
 * Under modern atproto scopes (without transition:generic), some API endpoints
 * require specific rpc:{nsid}?aud={did} scopes that the current token may not
 * have. These should be treated as graceful feature degradation, not reauth.
 */
export function isMissingScopeError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('Missing required scope') || msg.includes('missing_scope');
}
