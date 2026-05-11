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
  // Only merge interaction state, not counts. Counts always come from feed data
  // to ensure fresh server counts aren't overridden by stale optimistic updates.
  const { likeCount, commentCount, repostCount, ...interactionOnlyStored } = stored;
  return { ...defaultState, ...interactionOnlyStored };
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
      // Only persist user-specific interaction state, not counts.
      // Counts should always come from feed data to avoid stale counts
      // overriding fresh server data when the feed refetches.
      const { likeCount, commentCount, repostCount, ...interactionOnlyUpdate } = update;
      const current = newInteractions.get(postUri) ?? {};
      newInteractions.set(postUri, { ...current, ...interactionOnlyUpdate });
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
