/**
 * Profile Interaction Store
 * General-purpose per-profile state to reduce scattered useState
 * Complements ProfileCache (data) with UI/interaction flags
 */
import { create } from 'zustand';

export interface ProfileFlags {
  did: string;
  handle?: string;
  // Interaction flags
  isFollowing?: boolean; // local follow state override
  isMuted?: boolean;
  isBlocked?: boolean;
  notificationsEnabled?: boolean; // per-profile notifications
  isSaved?: boolean; // saved/bookmarked profile
  // Client-only metadata
  notes?: string; // user private notes about a profile
  lastVisitedAt?: number; // local visit tracking
}

interface ProfileInteractionState {
  profiles: Map<string, ProfileFlags>; // keyed by DID
  setFlags: (did: string, flags: Partial<ProfileFlags>) => void;
  getFlags: (did: string) => ProfileFlags | undefined;
  batchSetFlags: (updates: Array<{ did: string; flags: Partial<ProfileFlags> }>) => void;
  clearAll: () => void;
}

export const useProfileInteractionStore = create<ProfileInteractionState>((set, get) => ({
  profiles: new Map(),
  setFlags: (did, flags) => {
    set(state => {
      const next = new Map(state.profiles);
      const current = next.get(did) || { did };
      next.set(did, { ...current, ...flags });
      return { profiles: next };
    });
  },
  getFlags: did => get().profiles.get(did),
  batchSetFlags: updates => {
    set(state => {
      const next = new Map(state.profiles);
      updates.forEach(({ did, flags }) => {
        const current = next.get(did) || { did };
        next.set(did, { ...current, ...flags });
      });
      return { profiles: next };
    });
  },
  clearAll: () => set({ profiles: new Map() }),
}));

// Convenience hook with handle fallback
export const useProfileFlags = (did?: string, handle?: string) => {
  const flags = useProfileInteractionStore(state => (did ? state.profiles.get(did) : undefined));
  const storeSetFlags = useProfileInteractionStore(state => state.setFlags);

  return {
    flags,
    setFlags: (next: Partial<ProfileFlags>) => {
      if (did) storeSetFlags(did, { ...next, handle: handle || next.handle });
    },
  };
};

// Minimal shape needed for current-user check
interface CurrentUserLike {
  did?: string | null;
  handle?: string | null;
}

// Check if profile is the current user
export const isCurrentUser = (
  profileDid?: string,
  profileHandle?: string,
  currentUser?: CurrentUserLike | null
): boolean => {
  if (!profileDid || !currentUser) return false;
  return profileDid === currentUser.did || profileHandle === currentUser.handle;
};
