import React, { useState, useCallback, useRef, useImperativeHandle, forwardRef } from 'react';
import { View, StyleSheet } from 'react-native';
import SwipeableFeedContainer, { FeedOption } from '../components/features/feed/SwipeableFeedContainer';
import { BRAND } from '../utils/formatting/Colors';

// Define the ref interface for HomeScreen
export interface HomeScreenRef {
  refresh: () => void;
  isRefreshing: boolean;
}

interface HomeScreenProps {}

const HomeScreen = forwardRef<HomeScreenRef, HomeScreenProps>((props, ref) => {
  const [currentFeed, setCurrentFeed] = useState<FeedOption>('yourMix');
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Expose refresh method to parent components
  useImperativeHandle(ref, () => ({
    refresh: () => {
      // Set refreshing state
      setIsRefreshing(true);
      
      // Trigger refresh by changing the key to force re-render
      setRefreshKey(prev => prev + 1);
      
      // Reset refreshing state after a short delay
      setTimeout(() => {
        setIsRefreshing(false);
      }, 2000); // Show loading for 2 seconds
    },
    isRefreshing
  }), [isRefreshing]);

  // Handle feed change from swipeable container
  const handleFeedChange = useCallback((newFeed: FeedOption) => {
    setCurrentFeed(newFeed);
  }, []);

  return (
    <View style={styles.container}>
      <SwipeableFeedContainer
        key={refreshKey}
        initialFeed="yourMix"
        onFeedChange={handleFeedChange}
        isRefreshing={isRefreshing}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.PRIMARY,
  },
});

export default HomeScreen;