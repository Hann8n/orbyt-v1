/**
 * Like and repost state: an optimistic tap, the create's URI replacing only its
 * own placeholder, and a rollback that never overwrites newer cache state.
 */
import {
  OPTIMISTIC_URI,
  confirmToggle,
  isConfirmedUri,
  optimisticToggle,
  rollbackToggle,
} from '@/utils/query/viewerToggle';

const LIKE = 'at://did:plc:me/app.bsky.feed.like/1';
const OTHER_LIKE = 'at://did:plc:me/app.bsky.feed.like/2';

describe('optimisticToggle', () => {
  it('likes with a placeholder and one more', () => {
    expect(optimisticToggle({ count: 4 }, true)).toEqual({ uri: OPTIMISTIC_URI, count: 5 });
  });

  it('unlikes without going below zero', () => {
    expect(optimisticToggle({ uri: LIKE, count: 0 }, false)).toEqual({
      uri: undefined,
      count: 0,
    });
  });
});

describe('confirmToggle', () => {
  it('replaces the placeholder with the created record', () => {
    expect(confirmToggle({ uri: OPTIMISTIC_URI, count: 5 }, true, LIKE)).toEqual({
      uri: LIKE,
      count: 5,
    });
  });

  it('keeps a real URI a refetch already wrote', () => {
    const current = { uri: OTHER_LIKE, count: 5 };
    expect(confirmToggle(current, true, LIKE)).toBe(current);
  });

  it('leaves an unlike as it is', () => {
    const current = { uri: undefined, count: 3 };
    expect(confirmToggle(current, false, undefined)).toBe(current);
  });
});

describe('rollbackToggle', () => {
  const previous = { uri: undefined, count: 4 };
  const optimistic = optimisticToggle(previous, true);

  it('reverts while the cache holds this mutation’s optimistic value', () => {
    expect(rollbackToggle(optimistic, optimistic, previous)).toBe(previous);
  });

  it('never writes the placeholder back over a real like', () => {
    const unlikePrevious = { uri: LIKE, count: 5 };
    const unlikeOptimistic = optimisticToggle(unlikePrevious, false);
    // A failed unlike restores the confirmed like it started from, not a placeholder.
    expect(rollbackToggle(unlikeOptimistic, unlikeOptimistic, unlikePrevious)).toEqual({
      uri: LIKE,
      count: 5,
    });
    // A refetch that landed first wins over the stale rollback.
    const refetched = { uri: OTHER_LIKE, count: 9 };
    expect(rollbackToggle(refetched, optimistic, previous)).toBe(refetched);
  });
});

describe('isConfirmedUri', () => {
  it('accepts only a deletable record URI', () => {
    expect(isConfirmedUri(LIKE)).toBe(true);
    expect(isConfirmedUri(OPTIMISTIC_URI)).toBe(false);
    expect(isConfirmedUri(undefined)).toBe(false);
  });
});
