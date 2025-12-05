/**
 * Profile Interaction Store
 * General-purpose per-profile state to reduce scattered useState
 * Complements ProfileCache (data) with UI/interaction flags
 */
import { create } from 'zustand';
import { useUserStore } from './userStore';

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
  getFlags: (did) => get().profiles.get(did),
  batchSetFlags: (updates) => {
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

/**
 * Global utility to check if a profile is the current user
 * Can be used with DID or handle
 */
export const useIsCurrentUser = (did?: string, handle?: string): boolean => {
  const currentUser = useUserStore(state => state.currentUser);
  
  if (!currentUser) return false;
  
  // Check by DID first (most reliable)
  if (did && currentUser.did) {
    return did === currentUser.did;
  }
  
  // Fallback to handle comparison
  if (handle && currentUser.handle) {
    return handle.toLowerCase().trim() === currentUser.handle.toLowerCase().trim();
  }
  
  return false;
};

/**
 * Non-hook version for use outside React components
 * Accepts the current user from store state
 */
export const isCurrentUser = (did?: string, handle?: string, currentUser?: { did: string | null; handle: string | null } | null): boolean => {
  if (!currentUser) return false;
  
  // Check by DID first (most reliable)
  if (did && currentUser.did) {
    return did === currentUser.did;
  }
  
  // Fallback to handle comparison
  if (handle && currentUser.handle) {
    return handle.toLowerCase().trim() === currentUser.handle.toLowerCase().trim();
  }
  
  return false;
};
