import { XRPCError } from '@atproto/api';

import { ApiRequestError } from '@/services/api/fetchJson';
import { GatewaySessionExpiredError } from '@/services/auth/gateway';

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
  // An expired gateway session means the user must sign in again; retrying only delays the prompt.
  if (error instanceof GatewaySessionExpiredError) {
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
