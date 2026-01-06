/**
 * Modal State Management
 * Centralized Zustand store for global modals
 * Replaces manual state management in useGlobalModals hook
 */
import { create } from 'zustand';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { safeDismiss } from '../utils/components/truesheet/utils';

// Types
export interface CommentSectionData {
  post: any;
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
}

export const useModalStore = create<ModalState>((set, get) => ({
  // Account Switcher State
  accountSwitcherVisible: false,

  presentAccountSwitcher: () => {
    set({ accountSwitcherVisible: true });
  },

  dismissAccountSwitcher: () => {
    safeDismiss('account-switcher');
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

  dismissShareSheet: (skipDismiss = false) => {
    if (!skipDismiss) {
      safeDismiss('share-sheet');
    }
    set({ shareSheetData: null });
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
