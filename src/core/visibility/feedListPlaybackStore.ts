import { createContext } from 'react';

type FeedListPlaybackSnap = Readonly<{
  activeIndex: number;
  canPlay: boolean;
  headerBlockingPlayback: boolean;
}>;

const defaultSnap = (): FeedListPlaybackSnap => ({
  activeIndex: -1,
  canPlay: false,
  headerBlockingPlayback: false,
});

/** Bit 0: this row should play. */
export const ROW_BITS_PLAYBACK = 1 as const;
/** Bit 1: render heavy chrome (scrubber, social overlay) — active row ±1. */
export const ROW_BITS_CHROME = 2 as const;
/**
 * Bit 2: this row should hold an HLS source loaded into its `useVideoPlayer`.
 *
 * Asymmetric window so the next swipe target has a player that's already
 * past manifest fetch when the user advances. Tuned conservatively to keep
 * the concurrent AVPlayer count below the threshold that triggers
 * NSURLErrorDomain manifest thrash on Android (-1008 / -12884).
 *
 *   active - 1  ──┐
 *   active        ├── 4 rows hold a source
 *   active + 1    │
 *   active + 2  ──┘
 */
export const ROW_BITS_PRELOAD = 4 as const;

/** Rows behind the active index that keep their video source loaded. */
const PRELOAD_BEHIND = 1;
/** Rows ahead of the active index that keep their video source loaded. */
const PRELOAD_AHEAD = 2;

export function createFeedListPlaybackStore(seed?: Partial<FeedListPlaybackSnap>) {
  let snap: FeedListPlaybackSnap = { ...defaultSnap(), ...seed };
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(l => l());

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getRowBits(rowIndex: number) {
      const s = snap;
      const playback =
        s.activeIndex === rowIndex && s.canPlay && !s.headerBlockingPlayback
          ? ROW_BITS_PLAYBACK
          : 0;
      const chrome =
        s.activeIndex >= 0 && Math.abs(s.activeIndex - rowIndex) <= 1 ? ROW_BITS_CHROME : 0;
      const preload =
        s.activeIndex >= 0 &&
        rowIndex >= s.activeIndex - PRELOAD_BEHIND &&
        rowIndex <= s.activeIndex + PRELOAD_AHEAD
          ? ROW_BITS_PRELOAD
          : 0;
      return playback | chrome | preload;
    },
    patch(p: Partial<FeedListPlaybackSnap>) {
      const next = { ...snap, ...p };
      if (
        next.activeIndex === snap.activeIndex &&
        next.canPlay === snap.canPlay &&
        next.headerBlockingPlayback === snap.headerBlockingPlayback
      ) {
        return;
      }
      snap = next;
      emit();
    },
  };
}

export type FeedListPlaybackStore = ReturnType<typeof createFeedListPlaybackStore>;

/** Bits when the row is not under a list store (e.g. full-screen video). */
export const FEED_LIST_PLAYBACK_OUTSIDE_BITS =
  ROW_BITS_PLAYBACK | ROW_BITS_CHROME | ROW_BITS_PRELOAD;

export const FeedListPlaybackContext = createContext<FeedListPlaybackStore | null>(null);
