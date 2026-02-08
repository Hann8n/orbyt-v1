/**
 * Profile colors - single module for API, persistence, and sync.
 * Use hooks for React; use functions for non-React (userStore, ActorService).
 */
export {
  getPersistedColorsSync,
  loadPersistedColors,
  prefetchOrbytColors,
  saveAndSyncColors,
  fetchColors,
  batchFetchColors,
  refreshColors,
  orbytColorKeys,
} from './OrbytColors';
export type { OrbytColorData } from './OrbytColors';

export { useOrbytColors, useAvatarProfileRing } from './useOrbytColors';
export type { AvatarProfileRingProps } from './useOrbytColors';
