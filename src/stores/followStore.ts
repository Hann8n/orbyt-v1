/**
 * Follow State Store
 * Manages follow/unfollow state persistence across navigation
 * Works alongside ProfileCache for immediate UI updates
 */
import { create } from 'zustand';

interface FollowState {
  handle: string;
  did: string;
  isFollowing: boolean;
  isFollowedBy?: boolean;
  followUri?: string; // URI from AT Protocol for unfollowing
}

interface FollowStoreState {
  // Map of DIDs to their follow state
  follows: Map<string, FollowState>;

  // Actions
  updateFollowState: (did: string, update: Partial<FollowState>) => void;
  getFollowState: (did: string) => FollowState | undefined;
  clearFollows: () => void;
  clearFollowForDid: (did: string) => void;

  // Batch operations
  batchUpdateFollows: (updates: Array<{ did: string; state: Partial<FollowState> }>) => void;
}

export const useFollowStore = create<FollowStoreState>((set, get) => ({
  follows: new Map(),

  updateFollowState: (did: string, update: Partial<FollowState>) => {
    set(state => {
      const newFollows = new Map(state.follows);
      const current = newFollows.get(did);

      if (current) {
        newFollows.set(did, { ...current, ...update });
      } else {
        // Create new entry if it doesn't exist
        newFollows.set(did, {
          handle: update.handle || '',
          did,
          isFollowing: update.isFollowing ?? false,
          isFollowedBy: update.isFollowedBy,
          followUri: update.followUri,
        });
      }

      return { follows: newFollows };
    });
  },

  getFollowState: (did: string) => {
    return get().follows.get(did);
  },

  clearFollows: () => {
    set({ follows: new Map() });
  },

  clearFollowForDid: (did: string) => {
    set(state => {
      const newFollows = new Map(state.follows);
      newFollows.delete(did);
      return { follows: newFollows };
    });
  },

  batchUpdateFollows: (updates: Array<{ did: string; state: Partial<FollowState> }>) => {
    set(state => {
      const newFollows = new Map(state.follows);

      updates.forEach(({ did, state: updateState }) => {
        const current = newFollows.get(did);

        if (current) {
          newFollows.set(did, { ...current, ...updateState });
        } else {
          newFollows.set(did, {
            handle: updateState.handle || '',
            did,
            isFollowing: updateState.isFollowing ?? false,
            isFollowedBy: updateState.isFollowedBy,
            followUri: updateState.followUri,
          });
        }
      });

      return { follows: newFollows };
    });
  },
}));

// Convenience hook for getting follow state with handle fallback
export const useFollowState = (did?: string, handle?: string) => {
  const followState = useFollowStore(state => (did ? state.follows.get(did) : undefined));
  const updateFollowState = useFollowStore(state => state.updateFollowState);

  return {
    followState,
    updateFollowState: (update: Partial<FollowState>) => {
      if (did) {
        updateFollowState(did, { ...update, handle: handle || update.handle });
      }
    },
  };
};
