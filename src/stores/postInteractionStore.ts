/**
 * Post Interaction Store
 * Manages like and repost state for videos across the app
 * Ensures state persistence when users navigate away and return
 */
import { create } from 'zustand';

interface PostInteraction {
  likeUri?: string;
  repostUri?: string;
  bookmarkUri?: string;
  isLiked: boolean;
  isReposted: boolean;
  isBookmarked: boolean;
  likeCount: number;
  repostCount: number;
}

interface PostInteractionState {
  // Map of post URIs to their interaction state
  interactions: Map<string, PostInteraction>;

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
      const current = newInteractions.get(postUri) || {
        isLiked: false,
        isReposted: false,
        isBookmarked: false,
        likeCount: 0,
        repostCount: 0,
      };
      newInteractions.set(postUri, { ...current, ...update });
      return { interactions: newInteractions };
    });
  },

  getPostInteraction: (postUri: string, defaultState: PostInteraction) => {
    return get().interactions.get(postUri) || defaultState;
  },

  clearInteractions: () => {
    set({ interactions: new Map() });
  },
}));
