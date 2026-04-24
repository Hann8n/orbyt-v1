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
/** Bit 1: render heavy chrome (scrubber, backdrop) — active row ±1. */
export const ROW_BITS_CHROME = 2 as const;

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
      return playback | chrome;
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
export const FEED_LIST_PLAYBACK_OUTSIDE_BITS = ROW_BITS_PLAYBACK | ROW_BITS_CHROME;

export const FeedListPlaybackContext = createContext<FeedListPlaybackStore | null>(null);
