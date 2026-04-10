/**
 * Profile colors - single module for API, persistence, and sync.
 * Use hooks for React; use functions for non-React (userStore, ActorService).
 */
export {
  getPersistedColorsSync,
  loadPersistedColors,
  prefetchOrbytColors,
  syncOrbytColorsQuery,
  saveAndSyncColors,
  fetchColors,
  batchFetchColors,
  getOrbytColorKey,
  getOrbytColorQueryOptions,
} from './OrbytColors';
export type { OrbytColorData } from './OrbytColors';

export {
  useOrbytColors,
  useAvatarProfileRing,
  useCurrentUserOrbytShellColors,
} from './useOrbytColors';
export type { AvatarProfileRingProps } from './useOrbytColors';
