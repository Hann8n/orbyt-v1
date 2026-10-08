/**
 * The state a feed with no rows shows: spinner, offline, error with Retry, an
 * error Retry cannot fix (4xx), or the feed's empty message.
 */
import { XRPCError } from '@atproto/api';

import { getFeedEmptyState } from '@/utils/feed/feedEmptyState';
import { isRetryableError } from '@/utils/query/retryPolicy';

jest.mock('expo-crypto', () => ({}));
jest.mock('expo-secure-store', () => ({}));
jest.mock('expo-web-browser', () => ({}));

const base = { feedOption: 'profile', isLoading: false, isError: false };

describe('getFeedEmptyState', () => {
  it('shows the spinner while the first page loads', () => {
    expect(getFeedEmptyState({ ...base, isLoading: true })).toBe('loading');
  });

  it('shows no connection when the first fetch is paused offline', () => {
    expect(getFeedEmptyState({ ...base, isLoading: true, isPaused: true })).toBe('no-connection');
  });

  it('shows the error with Retry for a retryable failure', () => {
    expect(getFeedEmptyState({ ...base, isError: true })).toBe('error');
  });

  it('shows the error without Retry when retrying cannot help', () => {
    expect(getFeedEmptyState({ ...base, isError: true, isErrorRetryable: false })).toBe(
      'unavailable'
    );
  });

  it("shows the feed's empty message when the server returned nothing", () => {
    expect(getFeedEmptyState(base)).toBe('no-videos');
    expect(getFeedEmptyState({ ...base, feedOption: 'following' })).toBe('no-following');
  });
});

describe('isRetryableError', () => {
  it('retries network and server failures', () => {
    expect(isRetryableError(new TypeError('Network request failed'))).toBe(true);
    expect(isRetryableError(new XRPCError(502))).toBe(true);
    expect(isRetryableError(new XRPCError(1))).toBe(true);
  });

  it('does not retry not-found or unavailable', () => {
    expect(isRetryableError(new XRPCError(400, 'AccountDeactivated'))).toBe(false);
    expect(isRetryableError(new XRPCError(404))).toBe(false);
  });
});
