/**
 * Optimistic state for the viewer's like or repost of a record: the record URI the viewer
 * created (`viewer.like` / `viewer.repost`) and the public count beside it.
 *
 * One mutation per record runs at a time (taps while one is in flight are ignored), so each
 * transition only has to protect against the cache changing under it, e.g. a refetch landing.
 */

/** Stands in for the record URI until the create returns. */
export const OPTIMISTIC_URI = 'optimistic';

export interface ToggleState {
  uri?: string;
  count: number;
}

/** A record URI that can be deleted: present and not the in-flight placeholder. */
export const isConfirmedUri = (uri: string | undefined): uri is string =>
  !!uri && uri !== OPTIMISTIC_URI;

/** The state shown as soon as the viewer taps. */
export function optimisticToggle(previous: ToggleState, on: boolean): ToggleState {
  return on
    ? { uri: OPTIMISTIC_URI, count: previous.count + 1 }
    : { uri: undefined, count: Math.max(0, previous.count - 1) };
}

/** The create succeeded: its URI replaces this mutation's placeholder, and nothing else. */
export function confirmToggle(current: ToggleState, on: boolean, uri: string | undefined) {
  return on && uri && current.uri === OPTIMISTIC_URI ? { ...current, uri } : current;
}

/**
 * The write failed: revert only while the cache still holds this mutation's own optimistic
 * value. Anything else (a refetch, another write) is newer than the tap and stays.
 */
export function rollbackToggle(
  current: ToggleState,
  optimistic: ToggleState,
  previous: ToggleState
): ToggleState {
  return current.uri === optimistic.uri && current.count === optimistic.count ? previous : current;
}
