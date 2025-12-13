/**
 * Comment Interaction Store
 * Manages like state and interactions for comments across the app
 * Ensures state persistence when users navigate away and return
 */
import { create } from 'zustand';

interface CommentInteraction {
  likeUri?: string;
  isLiked: boolean;
  likeCount: number;
}

interface CommentStoreState {
  // Map of comment URIs to their interaction state
  interactions: Map<string, CommentInteraction>;
  // Set of deleted comment URIs
  deletedComments: Set<string>;
  
  // Actions
  updateCommentInteraction: (commentUri: string, update: Partial<CommentInteraction>) => void;
  getCommentInteraction: (commentUri: string, defaultState: CommentInteraction) => CommentInteraction;
  clearInteractions: () => void;
  clearCommentInteraction: (commentUri: string) => void;
  markCommentAsDeleted: (commentUri: string) => void;
  isCommentDeleted: (commentUri: string) => boolean;
  clearDeletedComment: (commentUri: string) => void;
}

export const useCommentStore = create<CommentStoreState>((set, get) => ({
  interactions: new Map(),
  deletedComments: new Set(),
  
  updateCommentInteraction: (commentUri: string, update: Partial<CommentInteraction>) => {
    set((state) => {
      const newInteractions = new Map(state.interactions);
      const current = newInteractions.get(commentUri) || {
        isLiked: false,
        likeCount: 0,
      };
      newInteractions.set(commentUri, { ...current, ...update });
      return { interactions: newInteractions };
    });
  },
  
  getCommentInteraction: (commentUri: string, defaultState: CommentInteraction) => {
    return get().interactions.get(commentUri) || defaultState;
  },
  
  clearInteractions: () => {
    set({ interactions: new Map() });
  },
  
  clearCommentInteraction: (commentUri: string) => {
    set((state) => {
      const newInteractions = new Map(state.interactions);
      newInteractions.delete(commentUri);
      return { interactions: newInteractions };
    });
  },
  
  markCommentAsDeleted: (commentUri: string) => {
    set((state) => {
      const newDeletedComments = new Set(state.deletedComments);
      newDeletedComments.add(commentUri);
      return { deletedComments: newDeletedComments };
    });
  },
  
  isCommentDeleted: (commentUri: string) => {
    return get().deletedComments.has(commentUri);
  },
  
  clearDeletedComment: (commentUri: string) => {
    set((state) => {
      const newDeletedComments = new Set(state.deletedComments);
      newDeletedComments.delete(commentUri);
      return { deletedComments: newDeletedComments };
    });
  },
}));


