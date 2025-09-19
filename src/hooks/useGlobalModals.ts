/**
 * Consolidated Global Modal Hooks
 * Manages global state for modals and sheets across the app
 */

import { useState, useEffect, useCallback } from 'react';
import { TrueSheet } from '@lodev09/react-native-true-sheet';

// ============================================================================
// TYPES
// ============================================================================

interface CommentSectionData {
  post: any;
  totalLikes?: number;
  totalComments?: number;
  isLiked?: boolean;
  postedAt?: string;
  onToggleLike?: () => void;
  isLikePending?: boolean;
}

interface ShareSheetData {
  postUri: string;
  postCid?: string;
  authorDid: string;
  authorName?: string;
  feedOption?: 'yourMix' | 'following' | 'discover';
  sourceFeed?: string;
}

// ============================================================================
// GLOBAL STATE MANAGEMENT
// ============================================================================

// Account Switcher State
let currentAccountSwitcherVisible = false;
const accountSwitcherListeners: (() => void)[] = [];

// Comment Section State
let currentCommentSectionData: CommentSectionData | null = null;
const commentSectionListeners: Array<() => void> = [];

// Share Sheet State
let currentShareSheetData: ShareSheetData | null = null;
const shareSheetListeners: Array<() => void> = [];

// ============================================================================
// NOTIFICATION HELPERS
// ============================================================================

const notifyAccountSwitcherListeners = () => {
  accountSwitcherListeners.forEach(listener => listener());
};

const notifyCommentSectionListeners = () => {
  commentSectionListeners.forEach(listener => listener());
};

const notifyShareSheetListeners = () => {
  shareSheetListeners.forEach(listener => listener());
};

// ============================================================================
// ACCOUNT SWITCHER HOOK
// ============================================================================

export const useGlobalAccountSwitcher = () => {
  const [visible, setVisible] = useState<boolean>(currentAccountSwitcherVisible);

  useEffect(() => {
    const listener = () => {
      setVisible(currentAccountSwitcherVisible);
    };
    
    accountSwitcherListeners.push(listener);
    
    return () => {
      const index = accountSwitcherListeners.indexOf(listener);
      if (index > -1) {
        accountSwitcherListeners.splice(index, 1);
      }
    };
  }, []);

  const presentAccountSwitcher = useCallback(() => {
    currentAccountSwitcherVisible = true;
    notifyAccountSwitcherListeners();
  }, []);

  const dismissAccountSwitcher = useCallback(() => {
    currentAccountSwitcherVisible = false;
    notifyAccountSwitcherListeners();
  }, []);

  return {
    visible,
    presentAccountSwitcher,
    dismissAccountSwitcher,
  };
};

// ============================================================================
// COMMENT SECTION HOOK
// ============================================================================

export const useGlobalCommentSection = () => {
  const [data, setData] = useState<CommentSectionData | null>(currentCommentSectionData);

  useEffect(() => {
    const listener = () => {
      setData(currentCommentSectionData);
    };
    
    commentSectionListeners.push(listener);
    
    return () => {
      const index = commentSectionListeners.indexOf(listener);
      if (index > -1) {
        commentSectionListeners.splice(index, 1);
      }
    };
  }, []);

  const presentCommentSection = useCallback((newData: CommentSectionData) => {
    // Store the data globally so the CommentSection component can access it
    currentCommentSectionData = newData;
    
    // Notify all listeners
    notifyCommentSectionListeners();
    
    // Present the global CommentSection using TrueSheet's global method
    TrueSheet.present('comment-section');
  }, []);

  const dismissCommentSection = useCallback(() => {
    // Dismiss the global CommentSection using TrueSheet's global method
    TrueSheet.dismiss('comment-section');
    currentCommentSectionData = null;
    
    // Notify all listeners
    notifyCommentSectionListeners();
  }, []);

  return {
    presentCommentSection,
    dismissCommentSection,
    getCurrentData: () => data,
  };
};

// ============================================================================
// SHARE SHEET HOOK
// ============================================================================

export const useGlobalShareSheet = () => {
  const [data, setData] = useState<ShareSheetData | null>(currentShareSheetData);

  useEffect(() => {
    const listener = () => {
      setData(currentShareSheetData);
    };
    
    shareSheetListeners.push(listener);
    
    return () => {
      const index = shareSheetListeners.indexOf(listener);
      if (index > -1) {
        shareSheetListeners.splice(index, 1);
      }
    };
  }, []);

  const presentShareSheet = useCallback((newData: ShareSheetData) => {
    // Store the data globally so the ShareSheet component can access it
    currentShareSheetData = newData;

    // Notify all listeners so the sheet content mounts before presenting
    notifyShareSheetListeners();

    // Defer present to the next frame to allow React to commit the new UI
    // This avoids measuring an empty sheet when using auto sizing
    requestAnimationFrame(() => {
      TrueSheet.present('share-sheet');
    });
  }, []);

  const dismissShareSheet = useCallback(() => {
    // Dismiss the global ShareSheet using TrueSheet's global method
    TrueSheet.dismiss('share-sheet');
    currentShareSheetData = null;
    
    // Notify all listeners
    notifyShareSheetListeners();
  }, []);

  return {
    presentShareSheet,
    dismissShareSheet,
    getCurrentData: () => data,
  };
};
