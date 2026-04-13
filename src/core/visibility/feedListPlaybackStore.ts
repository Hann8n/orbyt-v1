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

export function createFeedListPlaybackStore(seed?: Partial<FeedListPlaybackSnap>) {
  let snap: FeedListPlaybackSnap = { ...defaultSnap(), ...seed };
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(l => l());

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** `playback (0|1) + neighborChrome (0|1) * 10` — stable for Object.is in useSyncExternalStore. */
    getRowBits(rowIndex: number) {
      const s = snap;
      const playback = s.activeIndex === rowIndex && s.canPlay && !s.headerBlockingPlayback ? 1 : 0;
      const neighborChrome = s.activeIndex >= 0 && Math.abs(s.activeIndex - rowIndex) <= 1 ? 1 : 0;
      return playback + neighborChrome * 10;
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
export const FEED_LIST_PLAYBACK_OUTSIDE_BITS = 11;

export const FeedListPlaybackContext = createContext<FeedListPlaybackStore | null>(null);
