# Unified Feed System - Zero Redundancy Architecture

## Overview

The feed system has been completely unified to eliminate redundancy and ensure cursor position persistence across all components. All feed-related state is now managed through a single source of truth.

## Architecture

### 1. Single Source of Truth: `useFeedQuery`

**Location**: `src/hooks/useFeedQuery.tsx`

**Responsibilities**:
- Manages all feed data fetching
- Stores cursor positions for each feed
- Tracks visible video state
- Provides unified interface for all components

**Key Features**:
```typescript
// Unified state store
const feedStateStore = new Map<string, {
  cursor: string | null;
  scrollPosition: number;
  visibleIndex: number;
  visibleVideo: string | null;
  pages: APIResponse[];
}>();

// Unified interface
return {
  ...query,
  feed,
  scrollPosition,
  visibleIndex,
  visibleVideo,
  saveScrollPosition,
  saveVisibleState,
  getScrollPosition,
  getVisibleState,
};
```

### 2. FeedFetcher: Unified Interface Layer

**Location**: `src/components/features/feed/FeedFetcher.tsx`

**Responsibilities**:
- Uses unified `useFeedQuery` interface
- Eliminates redundant state management
- Provides consistent props to ListFeedView
- Handles profile prefetching

**Key Optimizations**:
```typescript
// Uses unified interface
const {
  feed,
  scrollPosition,
  visibleIndex,
  visibleVideo,
  saveScrollPosition,
  saveVisibleState,
  getScrollPosition,
  getVisibleState,
} = useFeedQuery(feedOption, userDid, queryOptions);

// Unified handlers
const handlePositionChange = useCallback((position: number) => {
  saveScrollPosition(position);
  if (onPositionChange) onPositionChange(position);
}, [saveScrollPosition, onPositionChange]);

const handleVisibleChange = useCallback((index: number, video: string | null) => {
  saveVisibleState(index, video);
}, [saveVisibleState]);
```

### 3. ListFeedView: Optimized Rendering

**Location**: `src/components/features/feed/ListFeedView.tsx`

**Responsibilities**:
- Renders feed items with minimal re-renders
- Handles scroll position saving
- Manages video visibility
- Optimized for performance

**Key Optimizations**:
```typescript
// Optimized scroll handler
const onMomentumScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
  const offsetY = e.nativeEvent.contentOffset.y;
  
  // Save position immediately when scrolling stops
  if (onPositionChange) {
    if (Math.abs(offsetY - lastSavedPosition.current) > 50) {
      onPositionChange(offsetY);
      lastSavedPosition.current = offsetY;
    }
  }
}, [onPositionChange]);

// Optimized renderItem
const renderItem = useCallback(({ item, index }: { item: FeedItem; index: number }) => {
  // Minimal dependencies for better performance
}, [memoizedCardHeight, visibleRange.min, visibleRange.max, memoizedFeedOption, memoizedScrollYShared, memoizedIsVisible, handleVideoStatus, isModal, setIsScrubbing]);
```

### 4. SwipeableFeedContainer: Simplified State Management

**Location**: `src/components/features/feed/SwipeableFeedContainer.tsx`

**Responsibilities**:
- Manages feed switching
- Handles feed bar visibility
- Eliminates redundant position tracking
- Optimized for smooth swiping

**Key Optimizations**:
```typescript
// Removed redundant state
// const [savedPositions, setSavedPositions] = useState<{ [key in FeedOption]?: number }>({});

// Simplified feed rendering
const renderFeed = useCallback(({ item: feedOption, index }: { item: FeedOption; index: number }) => {
  const isVisible = index === currentFeedIndex;
  
  return (
    <View style={[styles.feedPage, { width: screenWidth, height: '100%' }]}> 
      <FeedFetcher
        feedOption={String(feedOption)}
        onRetryFeed={handleRetryFeed}
        queryOptions={{
          enabled: true,
          staleTime: 5 * 60 * 1000,
          refetchOnMount: false,
          refetchOnWindowFocus: false,
        }}
        isVisible={isVisible}
        onVerticalScroll={(scrollY) => handleVerticalScroll(scrollY, index)}
        isRefreshing={isRefreshing}
        onScrubbingChange={handleScrubbingChange}
      />
    </View>
  );
}, [currentFeedIndex, handleRetryFeed, handleVerticalScroll, isRefreshing, screenWidth, handleScrubbingChange]);
```

### 5. MemoizedVideoItem: Optimized Video Rendering

**Location**: `src/components/features/feed/MemoizedVideoItem.tsx`

**Responsibilities**:
- Renders individual video items
- Prevents unnecessary re-renders
- Optimized memoization

**Key Optimizations**:
```typescript
// Enhanced memo comparison
const MemoizedVideoItem = React.memo(
  VideoItem,
  (prevProps, nextProps) => {
    // Quick URI check first (most common change)
    if (prevPost.uri !== nextPost.uri) return false;
    
    // Skip re-render if only scrollY changed (very frequent)
    if (prevProps.scrollY !== nextProps.scrollY) {
      const prevScrollY = prevProps.scrollY?.value || 0;
      const nextScrollY = nextProps.scrollY?.value || 0;
      if (Math.abs(prevScrollY - nextScrollY) > 50) {
        return false;
      }
    }
    
    return true;
  }
);
```

### 6. VideoCard: Optimized Video Playback

**Location**: `src/components/features/video/VideoCard.tsx`

**Responsibilities**:
- Handles video playback
- Manages video state
- Optimized progress updates

**Key Optimizations**:
```typescript
// Increased progress update threshold
const handleProgress = useCallback((data: any) => {
  const newProgress = data.currentTime / data.playableDuration;
  if (Math.abs(newProgress - progress) > 0.1) { // Increased threshold
    setProgress(newProgress);
    setCurrentPosition(data.currentTime);
  }
}, [progress]);
```

## Data Flow

### 1. Feed State Management
```
useFeedQuery (Global Store)
    ↓
FeedFetcher (Interface Layer)
    ↓
ListFeedView (Rendering)
    ↓
MemoizedVideoItem (Individual Items)
    ↓
VideoCard (Video Playback)
```

### 2. Position Persistence
```
User Scrolls → ListFeedView.onMomentumScrollEnd → FeedFetcher.handlePositionChange → useFeedQuery.saveScrollPosition → Global Store
```

### 3. Feed Switching
```
User Swipes → SwipeableFeedContainer.handleHorizontalScroll → FeedFetcher (with new feedOption) → useFeedQuery (loads saved state)
```

## Key Benefits

### 1. Zero Redundancy
- Single source of truth for all feed state
- No duplicate position tracking
- Unified cursor management
- Consistent state across all components

### 2. Optimized Performance
- Reduced re-renders through better memoization
- Optimized scroll event handling
- Minimal FlatList configuration
- Efficient video progress updates

### 3. Persistent State
- Cursor positions saved per feed
- Visible video state preserved
- Smooth feed switching
- No state loss during navigation

### 4. Simplified Architecture
- Clear data flow
- Minimal prop drilling
- Consistent interfaces
- Easy to maintain and debug

## Performance Optimizations

### 1. Scroll Event Optimization
- Increased scroll threshold (10 → 20 pixels)
- RequestAnimationFrame for state updates
- Reduced scroll event frequency
- Optimized scroll direction tracking

### 2. Render Optimization
- Minimal renderItem dependencies
- Enhanced memoization
- Reduced FlatList window size
- Optimized batch rendering

### 3. Video Optimization
- Increased progress update threshold (5% → 10%)
- Optimized video status handling
- Reduced video processing during scroll
- Better memory management

### 4. State Management
- Single global store
- Unified state updates
- Eliminated redundant state
- Consistent state persistence

## Testing the Unified System

### 1. Cursor Position Persistence
- Scroll in a feed
- Switch to another feed
- Switch back to original feed
- Verify scroll position is restored

### 2. Video State Persistence
- Play a video in a feed
- Switch to another feed
- Switch back to original feed
- Verify video state is preserved

### 3. Performance Testing
- Rapid feed switching
- Smooth scrolling
- Video playback during scroll
- Memory usage monitoring

### 4. Error Handling
- Network errors
- Feed loading failures
- State corruption recovery
- Graceful degradation

## Future Enhancements

### 1. Advanced Caching
- Implement feed content caching
- Optimize memory usage
- Add cache invalidation strategies

### 2. Virtual Scrolling
- Implement true virtual scrolling
- Only render visible items
- Optimize for very large feeds

### 3. Intelligent Preloading
- Smart video preloading
- Predictive feed loading
- Background content preparation

### 4. Enhanced Analytics
- Performance monitoring
- User interaction tracking
- Feed engagement metrics 