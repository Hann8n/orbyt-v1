import { TokenInvalidError, TokenRefreshError, TokenRevokedError } from '@atproto/oauth-client';
import { XRPCError } from '@atproto/xrpc';
import { ApiRequestError } from '@/services/api/fetchJson';

const NON_RETRYABLE_ERROR_NAMES = new Set(['AbortError', 'SyntaxError']);

function isRetryableStatus(status: number): boolean {
  // XRPC uses status < 100 for transport failures (network down, bad response).
  return status < 100 || status === 429 || status >= 500;
}

/**
 * Whether a failed request is worth retrying: transport errors, rate limits and 5xx are;
 * client errors (4xx), auth failures, aborts and malformed payloads are not.
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof XRPCError || error instanceof ApiRequestError) {
    return isRetryableStatus(error.status);
  }
  // OAuth session errors mean the user must sign in again; retrying only delays the prompt.
  if (
    error instanceof TokenRefreshError ||
    error instanceof TokenRevokedError ||
    error instanceof TokenInvalidError
  ) {
    return false;
  }
  if (error instanceof Error && NON_RETRYABLE_ERROR_NAMES.has(error.name)) {
    return false;
  }
  return true;
}

export function createRetryPolicy(maxRetries: number) {
  return (failureCount: number, error: unknown): boolean =>
    failureCount < maxRetries && isRetryableError(error);
}
