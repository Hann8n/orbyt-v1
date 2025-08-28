import { useState, useEffect, useCallback } from 'react';
import { TrueSheet } from '@lodev09/react-native-true-sheet';

interface CommentSectionData {
  post: any;
  totalLikes?: number;
  totalComments?: number;
  isLiked?: boolean;
  postedAt?: string;
  onToggleLike?: () => void;
  isLikePending?: boolean;
}

// Global state to store the current CommentSection data
let currentCommentSectionData: CommentSectionData | null = null;
let listeners: Array<() => void> = [];

// Function to notify all listeners when data changes
const notifyListeners = () => {
  listeners.forEach(listener => listener());
};

export const useGlobalCommentSection = () => {
  const [data, setData] = useState<CommentSectionData | null>(currentCommentSectionData);

  useEffect(() => {
    const listener = () => {
      setData(currentCommentSectionData);
    };
    
    listeners.push(listener);
    
    return () => {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, []);

  const presentCommentSection = useCallback((newData: CommentSectionData) => {
    console.log('[GlobalCommentSection] Presenting with data:', newData);
    // Store the data globally so the CommentSection component can access it
    currentCommentSectionData = newData;
    
    // Notify all listeners
    notifyListeners();
    
    // Present the global CommentSection using TrueSheet's global method
    TrueSheet.present('comment-section');
  }, []);

  const dismissCommentSection = useCallback(() => {
    // Dismiss the global CommentSection using TrueSheet's global method
    TrueSheet.dismiss('comment-section');
    currentCommentSectionData = null;
    
    // Notify all listeners
    notifyListeners();
  }, []);

  return {
    presentCommentSection,
    dismissCommentSection,
    getCurrentData: () => data,
  };
};
