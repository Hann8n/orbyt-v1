/**
 * Modal State Management
 * Centralized Zustand store for global modals
 * Replaces manual state management in useGlobalModals hook
 */
import { create } from 'zustand';

// Types
export interface CommentSectionPost {
  uri: string;
  cid?: string;
  indexedAt?: string;
  author?: {
    did: string;
    handle: string;
    displayName?: string;
  };
}

export interface CommentSectionData {
  post: CommentSectionPost | undefined;
  totalLikes?: number;
  totalComments?: number;
  isLiked?: boolean;
  postedAt?: string;
  onToggleLike?: () => void;
  isLikePending?: boolean;
  scrollToCommentUri?: string;
}

export interface ShareSheetData {
  postUri: string;
  postCid?: string;
  authorDid: string;
  authorName?: string;
  authorHandle?: string;
  feedOption?: 'following' | 'discover';
  sourceFeed?: string;
}

interface ModalState {
  // Account Switcher
  accountSwitcherVisible: boolean;
  presentAccountSwitcher: () => void;
  dismissAccountSwitcher: () => void;

  // Comment Section
  commentSectionData: CommentSectionData | null;
  presentCommentSection: (data: CommentSectionData) => void;
  dismissCommentSection: () => void;

  // Share Sheet
  shareSheetData: ShareSheetData | null;
  presentShareSheet: (data: ShareSheetData) => void;
  dismissShareSheet: (skipDismiss?: boolean) => void;

  // Global reset (logout/session interruption)
  resetAllModals: () => void;
}

export const useModalStore = create<ModalState>((set, _get) => ({
  // Account Switcher State
  accountSwitcherVisible: false,

  presentAccountSwitcher: () => {
    set({ accountSwitcherVisible: true });
  },

  dismissAccountSwitcher: () => {
    set({ accountSwitcherVisible: false });
  },

  // Comment Section State
  commentSectionData: null,

  presentCommentSection: (data: CommentSectionData) => {
    set({ commentSectionData: data });
  },

  dismissCommentSection: () => {
    set({ commentSectionData: null });
  },

  // Share Sheet State
  shareSheetData: null,

  presentShareSheet: (data: ShareSheetData) => {
    set({ shareSheetData: data });
  },

  dismissShareSheet: (_skipDismiss = false) => {
    set({ shareSheetData: null });
  },

  resetAllModals: () => {
    set({
      accountSwitcherVisible: false,
      commentSectionData: null,
      shareSheetData: null,
    });
  },
}));

// Convenience hooks with optimized selectors
export const useAccountSwitcher = () => {
  const visible = useModalStore(state => state.accountSwitcherVisible);
  const present = useModalStore(state => state.presentAccountSwitcher);
  const dismiss = useModalStore(state => state.dismissAccountSwitcher);

  return { visible, presentAccountSwitcher: present, dismissAccountSwitcher: dismiss };
};

export const useCommentSection = () => {
  const data = useModalStore(state => state.commentSectionData);
  const present = useModalStore(state => state.presentCommentSection);
  const dismiss = useModalStore(state => state.dismissCommentSection);

  return {
    presentCommentSection: present,
    dismissCommentSection: dismiss,
    getCurrentData: () => data,
  };
};

export const useShareSheet = () => {
  const data = useModalStore(state => state.shareSheetData);
  const present = useModalStore(state => state.presentShareSheet);
  const dismiss = useModalStore(state => state.dismissShareSheet);

  return {
    presentShareSheet: present,
    dismissShareSheet: dismiss,
    getCurrentData: () => data,
  };
};
