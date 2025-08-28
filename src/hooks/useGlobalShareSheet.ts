import { useCallback, useState, useEffect } from 'react';
import { TrueSheet } from '@lodev09/react-native-true-sheet';

interface ShareSheetData {
  postUri: string;
  postCid?: string;
  authorDid: string;
  authorName?: string;
  feedOption?: 'yourMix' | 'following' | 'discover';
  sourceFeed?: string;
}

// Global state to store the current ShareSheet data
let currentShareSheetData: ShareSheetData | null = null;
let listeners: Array<() => void> = [];

// Function to notify all listeners when data changes
const notifyListeners = () => {
  listeners.forEach(listener => listener());
};

export const useGlobalShareSheet = () => {
  const [data, setData] = useState<ShareSheetData | null>(currentShareSheetData);

  useEffect(() => {
    const listener = () => {
      setData(currentShareSheetData);
    };
    
    listeners.push(listener);
    
    return () => {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, []);

  const presentShareSheet = useCallback((newData: ShareSheetData) => {
    // Store the data globally so the ShareSheet component can access it
    currentShareSheetData = newData;
    
    // Notify all listeners
    notifyListeners();
    
    // Present the global ShareSheet using TrueSheet's global method
    TrueSheet.present('share-sheet');
  }, []);

  const dismissShareSheet = useCallback(() => {
    // Dismiss the global ShareSheet using TrueSheet's global method
    TrueSheet.dismiss('share-sheet');
    currentShareSheetData = null;
    
    // Notify all listeners
    notifyListeners();
  }, []);

  return {
    presentShareSheet,
    dismissShareSheet,
    getCurrentData: () => data,
  };
};
