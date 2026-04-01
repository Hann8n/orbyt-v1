/**
 * Post Interaction Store
 * Manages like and repost state for videos across the app
 * Ensures state persistence when users navigate away and return
 */
import { create } from 'zustand';

export interface PostInteraction {
  likeUri?: string;
  repostUri?: string;
  bookmarkUri?: string;
  isLiked: boolean;
  isReposted: boolean;
  isBookmarked: boolean;
  likeCount: number;
  commentCount: number;
  repostCount: number;
}

/** Merge feed-derived defaults with persisted partial deltas. Pure — safe for useMemo. */
export function mergePostInteractionDelta(
  defaultState: PostInteraction,
  stored: Partial<PostInteraction> | undefined
): PostInteraction {
  if (!stored) return defaultState;
  return { ...defaultState, ...stored };
}

interface PostInteractionState {
  // Partial deltas per post (only fields touched by optimistic updates); full state is
  // always derived in getPostInteraction via merge with feed-derived defaults.
  interactions: Map<string, Partial<PostInteraction>>;

  // Actions
  updatePostInteraction: (postUri: string, update: Partial<PostInteraction>) => void;
  getPostInteraction: (postUri: string, defaultState: PostInteraction) => PostInteraction;
  clearInteractions: () => void;
}

export const usePostInteractionStore = create<PostInteractionState>((set, get) => ({
  interactions: new Map(),

  updatePostInteraction: (postUri: string, update: Partial<PostInteraction>) => {
    set(state => {
      const newInteractions = new Map(state.interactions);
      // Merge onto existing persisted deltas only. Do not seed missing keys with zeros:
      // the first like/repost update would otherwise persist fake zeros and wipe repost/
      // comment state that still lives on the post from the feed (see getPostInteraction).
      const current = newInteractions.get(postUri) ?? {};
      newInteractions.set(postUri, { ...current, ...update });
      return { interactions: newInteractions };
    });
  },

  getPostInteraction: (postUri: string, defaultState: PostInteraction) => {
    return mergePostInteractionDelta(defaultState, get().interactions.get(postUri));
  },

  clearInteractions: () => {
    set({ interactions: new Map() });
  },
}));
