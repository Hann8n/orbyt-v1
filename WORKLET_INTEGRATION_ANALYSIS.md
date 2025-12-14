# Worklet Integration Analysis

## Overview

This document identifies heavy operations in the codebase that could benefit from React Native Reanimated worklets. Worklets run on the UI thread, avoiding JS bridge overhead and enabling smooth 60fps animations and scroll calculations.

**Note:** Worklets have limitations:
- Must be synchronous pure functions
- Cannot access React hooks or external state
- Cannot call async functions directly (must use `runOnJS`)
- Limited access to JavaScript APIs (some are available)

---

## ✅ Already Using Worklets

### 1. VideoScrubber.tsx
- ✅ Already has extensive worklet usage
- ✅ Time calculations in worklets
- ✅ Progress calculations in worklets
- Good example to reference!

### 2. VideoOverlayUI.tsx
- ✅ Uses worklets for repost animation style
- ✅ Good use of `useAnimatedStyle` with worklets

### 3. Various Animation Components
- ✅ Using Reanimated's `useAnimatedStyle` (which uses worklets internally)
- ✅ Good foundation for expansion

---

## 🎯 High-Value Worklet Integration Opportunities

### 1. **Video Post Filtering (AtprotoService.ts)** ⚠️ MEDIUM PRIORITY

**Location:** `src/services/api/AtprotoService.tsx:443-479`

**Current Problem:**
- Synchronously filters potentially large arrays of posts
- Runs on every feed fetch
- Multiple conditional checks per item
- Object property access and manipulation

**Current Code:**
```typescript
private static filterVideoPostsEfficiently(posts: any[]): any[] {
  const videoPosts: any[] = [];
  
  for (const item of posts) {
    const embed = item?.post?.embed;
    if (!embed) continue;
    
    let hasVideo = false;
    if (embed.$type === 'app.bsky.embed.video' || embed.$type === 'app.bsky.embed.video#view') {
      hasVideo = true;
    } else if (embed.$type === 'app.bsky.embed.recordWithMedia#view') {
      hasVideo = Boolean(embed.media?.$type === 'app.bsky.embed.video' || ...);
    }
    
    if (hasVideo) {
      // Process repost information
      if (item.reason?.by && item.reason.$type?.includes('reasonRepost')) {
        item.post.repostedBy = { ... };
      }
      videoPosts.push(item);
    }
  }
  
  return videoPosts;
}
```

**Recommendation:**
```typescript
// Worklet-optimized filtering function
const filterVideoPostsWorklet = (posts: any[]): any[] => {
  'worklet';
  const videoPosts: any[] = [];
  
  for (let i = 0; i < posts.length; i++) {
    const item = posts[i];
    const embed = item?.post?.embed;
    if (!embed) continue;
    
    let hasVideo = false;
    const embedType = embed.$type;
    
    if (embedType === 'app.bsky.embed.video' || embedType === 'app.bsky.embed.video#view') {
      hasVideo = true;
    } else if (embedType === 'app.bsky.embed.recordWithMedia#view') {
      const mediaType = embed.media?.$type;
      hasVideo = mediaType === 'app.bsky.embed.video' || mediaType === 'app.bsky.embed.video#view';
    }
    
    if (hasVideo) {
      videoPosts.push(item);
    }
  }
  
  return videoPosts;
};
```

**⚠️ Note:** Object mutation (`item.post.repostedBy = ...`) should be done on JS thread after filtering, as worklets should avoid side effects.

**Better Approach:**
- Use worklet for pure filtering (identify which posts have video)
- Do object mutations on JS thread after getting filtered results

---

### 2. **Scroll Header Visibility Calculations (ListFeedView.tsx)** ⚠️ MEDIUM PRIORITY

**Location:** `src/components/features/feed/ListFeedView.tsx:420-438`

**Current Code:**
```typescript
const onScrollNative = useCallback(
  (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (isHeaderFeed && headerHeight > 0) {
      const offsetY = e.nativeEvent.contentOffset.y;
      requestAnimationFrame(() => {
        const clampedOffset = Math.min(headerHeight, Math.max(0, offsetY));
        const visibleHeight = Math.max(0, headerHeight - clampedOffset);
        const visibilityRatio = headerHeight > 0 ? visibleHeight / headerHeight : 0;
        updateHeaderVisibility(visibilityRatio);
      });
    }
    if (onScroll) {
      onScroll(e);
    }
  },
  [onScroll, isHeaderFeed, headerHeight, updateHeaderVisibility],
);
```

**Recommendation:**
```typescript
// Use Reanimated's scroll handler for UI thread calculations
import { useAnimatedScrollHandler } from 'react-native-reanimated';
import { runOnJS } from 'react-native-reanimated';

const scrollY = useSharedValue(0);

const onScrollAnimated = useAnimatedScrollHandler({
  onScroll: (event) => {
    'worklet';
    scrollY.value = event.contentOffset.y;
    
    if (isHeaderFeed && headerHeight > 0) {
      const offsetY = event.contentOffset.y;
      const clampedOffset = Math.min(headerHeight, Math.max(0, offsetY));
      const visibleHeight = Math.max(0, headerHeight - clampedOffset);
      const visibilityRatio = headerHeight > 0 ? visibleHeight / headerHeight : 0;
      
      // Update shared value for UI thread animations
      // Or use runOnJS for state updates if needed
      runOnJS(updateHeaderVisibility)(visibilityRatio);
    }
  },
});

// Use onScrollAnimated instead of onScrollNative
<FlashList
  onScroll={onScrollAnimated}
  scrollEventThrottle={16} // For smooth 60fps
  // ... other props
/>
```

**Benefits:**
- Calculations run on UI thread (no JS bridge overhead)
- Smoother scrolling experience
- Better performance on low-end devices

---

### 3. **Viewability Item Calculations (hooks.ts)** 🔴 HIGH PRIORITY

**Location:** `src/core/visibility/hooks.ts:107-162`

**Current Problem:**
- Runs on **every scroll event** via `onViewableItemsChanged`
- Performs filtering and reduction operations on viewable items array
- Multiple array operations (filter, reduce) with property access
- Called frequently during scrolling, potentially causing frame drops

**Current Code:**
```typescript
const onViewableItemsChanged = useCallback(
  ({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (!isActive) {
      return;
    }

    const candidates = viewableItems.filter((token) => {
      const item = token.item as any;
      const uri = item?.post?.uri;
      return token.isViewable && typeof uri === 'string' && !item?.endCard;
    });

    if (candidates.length === 0) {
      if (lastVisibleUriRef.current !== null) {
        setFeedVisibleItem(scopeKey, null, -1);
        lastVisibleUriRef.current = null;
      }
      return;
    }

    const nextVisible = candidates.reduce((previous, current) => {
      if (previous === null) return current;

      const previousPercent = getViewablePercent(previous);
      const currentPercent = getViewablePercent(current);

      if (currentPercent !== previousPercent) {
        return currentPercent > previousPercent ? current : previous;
      }

      const previousIndex = typeof previous.index === 'number' ? previous.index : Number.MAX_SAFE_INTEGER;
      const currentIndex = typeof current.index === 'number' ? current.index : Number.MAX_SAFE_INTEGER;
      const lastIndex = lastVisibleIndexRef.current;

      if (lastIndex >= 0) {
        const previousDistance = Math.abs(previousIndex - lastIndex);
        const currentDistance = Math.abs(currentIndex - lastIndex);
        if (currentDistance !== previousDistance) {
          return currentDistance < previousDistance ? current : previous;
        }
      }

      return currentIndex >= previousIndex ? current : previous;
    }, null as ViewToken | null);

    const nextUri = (nextVisible?.item as any)?.post?.uri ?? null;
    const nextIndex = typeof nextVisible?.index === 'number' ? nextVisible.index : -1;

    if (nextUri !== lastVisibleUriRef.current) {
      lastVisibleUriRef.current = nextUri;
      lastVisibleIndexRef.current = nextIndex;
      setFeedVisibleItem(scopeKey, nextUri, nextIndex);
    }
  },
  [getViewablePercent, isActive, scopeKey, setFeedVisibleItem]
);
```

**Recommendation:**
Since `onViewableItemsChanged` is a callback from FlashList/FlatList, we can't directly convert it to a worklet. However, we can optimize the calculations:

**Option 1: Optimize the callback (keep on JS thread but make it faster)**
- Pre-compute viewable percent if possible
- Use for loops instead of filter/reduce for better performance
- Minimize object property access

**Option 2: Use Reanimated's scroll handler for visibility tracking**
- Track scroll position with `useAnimatedScrollHandler`
- Calculate which items should be visible based on scroll position
- Use `runOnJS` to update visibility state only when needed

**Note:** This is tricky because FlashList's viewability system is already optimized. The main benefit would be reducing JS thread work during scroll. Consider profiling first to see if this is actually a bottleneck.

---

### 4. **Feed Deduplication (useFeed.ts)** 🟡 MEDIUM PRIORITY

**Location:** `src/hooks/useFeed.ts:153-183`

**Current Problem:**
- Processes potentially large arrays of feed pages
- Creates Set and iterates through all items
- Runs in `useMemo` but could be heavy for large feeds
- Not called during scroll, but runs when feed data changes

**Current Code:**
```typescript
const feed = useMemo(() => {
  if (!feedPages.length) {
    return [] as FeedItem[];
  }

  const seenKeys = new Set<string>();
  const result: FeedItem[] = [];

  for (const page of feedPages) {
    const items = page?.feed ?? [];
    for (const item of items) {
      const uri = item?.post?.uri;
      const cid = item?.post?.cid;

      if (!uri) {
        continue;
      }

      // Use same key format as keyExtractor for consistency
      const key = cid ? `${uri}:${cid}` : uri;
      if (seenKeys.has(key)) {
        continue;
      }

      seenKeys.add(key);
      result.push(item);
    }
  }

  return result;
}, [feedPages]);
```

**Recommendation:**
This could benefit from a worklet if the feed is very large (1000+ items), but since it's not called during scroll/animations, the benefit is lower. Consider:

```typescript
const deduplicateFeedWorklet = (feedPages: any[]): FeedItem[] => {
  'worklet';
  if (feedPages.length === 0) {
    return [];
  }

  const seenKeys = new Set<string>();
  const result: FeedItem[] = [];

  for (let pageIdx = 0; pageIdx < feedPages.length; pageIdx++) {
    const page = feedPages[pageIdx];
    const items = page?.feed ?? [];
    
    for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
      const item = items[itemIdx];
      const uri = item?.post?.uri;
      const cid = item?.post?.cid;

      if (!uri) {
        continue;
      }

      const key = cid ? `${uri}:${cid}` : uri;
      if (seenKeys.has(key)) {
        continue;
      }

      seenKeys.add(key);
      result.push(item);
    }
  }

  return result;
};

// Usage
const feed = useMemo(() => {
  return deduplicateFeedWorklet(feedPages);
}, [feedPages]);
```

**⚠️ Note:** Set operations in worklets should be tested. If Set is not available, use a Map or array-based approach.

---

### 5. **Date Formatting (RelativeDate.tsx)** 🟢 LOW PRIORITY

**Location:** `src/components/ui/RelativeDate.tsx:33-82`

**Current Problem:**
- Called during render for each post/item
- Date parsing and calculations for every visible post
- If many posts are visible, this could add up

**Current Code:**
```typescript
export const formatRelativeDate = (dateString?: string, showTime: boolean = false): string => {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  // ... more calculations
};
```

**Recommendation:**
**NOT recommended for worklet conversion** because:
- Date API in worklets is unreliable/limited
- This is called during render, not during scroll
- Better optimization: **Memoize formatted dates** or **pre-format on the server/API**

**Better Approach:**
- Cache formatted dates in the post data
- Use `useMemo` to memoize formatted dates per post
- Format dates when data is fetched, not during render

---

### 7. **Indicator Style Calculations (SwipeableFeedContainer.tsx)** ⚠️ LOW PRIORITY

**Location:** `src/components/features/feed/SwipeableFeedContainer.tsx:321-349`

**Current Code:**
```typescript
const getIndicatorStyle = useCallback((feedOption: FeedOption) => {
  const feedIndex = feedOptions.findIndex(option => option === feedOption);
  const isActive = feedOption === currentFeedOption;
  
  const baseProgress = hasAppliedInitialIndexRef.current
    ? indicatorScrollProgress
    : (feedOptions.findIndex(option => option === initialFeed) >= 0 
        ? feedOptions.findIndex(option => option === initialFeed) 
        : 0);
  
  // Calculate opacity based on distance from current position
  let opacity = 0.75;
  if (isActive) {
    opacity = 1;
  } else {
    const distance = Math.abs(baseProgress - feedIndex);
    opacity = Math.max(0.3, 1 - distance * 0.4);
  }
  
  return {
    color: isActive ? Colors.white : 'rgba(255, 255, 255, 0.75)',
    fontSize: indicatorBaseFontSize,
    marginRight: 8,
    fontFamily: 'Firma-Black',
    opacity,
  };
}, [/* deps */]);
```

**Recommendation:**
If this is called frequently during scroll animations, consider using `useAnimatedStyle`:

```typescript
const indicatorOpacity = useSharedValue(1);

const indicatorStyle = useAnimatedStyle(() => {
  'worklet';
  const distance = Math.abs(indicatorScrollProgress.value - feedIndex);
  const opacity = isActive ? 1 : Math.max(0.3, 1 - distance * 0.4);
  
  return {
    opacity,
  };
});
```

---

### 8. **Moderation Filtering (ModerationService.ts)** ❌ NOT SUITABLE

**Location:** `src/services/ModerationService.ts:346-363`

**Reason:** This is already async and involves network/API calls. Worklets are for synchronous calculations, not async operations. Keep as-is.

---

## 📊 Summary by Priority

| Operation | File | Priority | Impact | Difficulty | Notes |
|-----------|------|----------|--------|------------|-------|
| Viewability calculations | `hooks.ts` | 🔴 HIGH | High | Medium | Runs on every scroll event |
| Scroll header visibility | `ListFeedView.tsx` | 🟡 MEDIUM | Medium | Low | Direct scroll handler optimization |
| Video post filtering | `AtprotoService.ts` | 🟡 MEDIUM | Medium | Low | Pure filtering logic |
| Feed deduplication | `useFeed.ts` | 🟡 MEDIUM | Low-Medium | Low | Not during scroll, but processes large arrays |
| Date formatting | `RelativeDate.tsx` | 🟢 LOW | Low | N/A | Better optimized with memoization |
| Indicator styles | `SwipeableFeedContainer.tsx` | 🟢 LOW | Low | Low | Only if called frequently during scroll |

---

## 🚀 Implementation Strategy

### Phase 1: Quick Wins (Low Risk, High Impact)
1. **Scroll header visibility** - Easy to implement, immediate UX improvement
2. **Video post filtering** - Pure filtering logic, easy to convert

### Phase 2: High-Value Optimizations (Requires Testing)
3. **Viewability calculations** - High impact but requires careful testing with FlashList's viewability system
4. **Feed deduplication** - Only if processing very large feeds (1000+ items)

### Phase 3: Lower Priority (If Needed)
5. **Indicator styles** - Only if performance issues arise during swipe animations
6. **Date formatting** - Better optimized with memoization/caching instead of worklets

---

## ⚠️ Important Considerations

### 1. Worklet Limitations
- **No Date API in some contexts** - Test Date parsing carefully
- **Limited Regex support** - May need to keep regex on JS thread
- **No async operations** - Must use `runOnJS` for callbacks
- **Limited object mutation** - Prefer immutable patterns

### 2. Testing Required
- Test on low-end devices (iPhone SE, mid-range Android)
- Profile before/after with React Native Performance Monitor
- Verify no regressions in functionality

### 3. When NOT to Use Worklets
- Operations already async (network, file I/O)
- Operations needing React hooks or context
- Operations with complex object mutations
- Operations that are already fast enough (< 5ms)

---

## 📝 Code Examples

### Example 1: Converting Array Filter to Worklet

**Before:**
```typescript
const filtered = items.filter(item => item.value > threshold);
```

**After:**
```typescript
const filterByThreshold = (items: Item[], threshold: number): Item[] => {
  'worklet';
  const filtered: Item[] = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].value > threshold) {
      filtered.push(items[i]);
    }
  }
  return filtered;
};

// Usage
const filteredItems = useSharedValue<Item[]>([]);
useEffect(() => {
  filteredItems.value = filterByThreshold(items, threshold);
}, [items, threshold]);
```

### Example 2: Scroll Handler with Worklet

**Before:**
```typescript
const onScroll = (e) => {
  const offsetY = e.nativeEvent.contentOffset.y;
  const progress = offsetY / maxScroll;
  updateProgress(progress);
};
```

**After:**
```typescript
const scrollY = useSharedValue(0);

const onScroll = useAnimatedScrollHandler({
  onScroll: (event) => {
    'worklet';
    scrollY.value = event.contentOffset.y;
    const progress = scrollY.value / maxScroll;
    runOnJS(updateProgress)(progress);
  },
});
```

---

## 🔍 Profiling Recommendations

Before implementing worklets, profile to identify bottlenecks:

1. **Enable Performance Monitor:**
   ```typescript
   import { enableScreens } from 'react-native-screens';
   ```

2. **Use Chrome DevTools Performance Tab:**
   - Look for long tasks (>50ms)
   - Identify frame drops during scroll
   - Check JS thread blocking

3. **Test Metrics:**
   - Frame rate during heavy operations
   - Time to filter/process posts
   - Scroll FPS during feed browsing

---

## 🔬 Additional Findings & Considerations

### Viewability Calculations Deep Dive

The `onViewableItemsChanged` callback in `hooks.ts` is called frequently during scrolling. While we can't directly convert FlashList's viewability callback to a worklet, we can optimize it:

**Current Bottlenecks:**
1. `filter()` creates a new array on every call
2. `reduce()` iterates through candidates multiple times
3. Multiple `findIndex()` calls in `getIndicatorStyle`
4. Object property access (`item?.post?.uri`) in hot path

**Optimization Strategies:**

1. **Replace array methods with for loops:**
   ```typescript
   // Instead of filter + reduce
   let bestCandidate: ViewToken | null = null;
   let bestPercent = 0;
   let bestIndex = Number.MAX_SAFE_INTEGER;
   
   for (let i = 0; i < viewableItems.length; i++) {
     const token = viewableItems[i];
     const item = token.item as any;
     const uri = item?.post?.uri;
     
     if (!token.isViewable || typeof uri !== 'string' || item?.endCard) {
       continue;
     }
     
     const percent = getViewablePercent(token);
     const index = typeof token.index === 'number' ? token.index : Number.MAX_SAFE_INTEGER;
     
     // Find best candidate in single pass
     if (percent > bestPercent || (percent === bestPercent && index < bestIndex)) {
       bestCandidate = token;
       bestPercent = percent;
       bestIndex = index;
     }
   }
   ```

2. **Pre-compute feed indices** to avoid `findIndex()` calls:
   ```typescript
   // Create a Map once: feedOption -> index
   const feedIndexMap = useMemo(() => {
     const map = new Map<FeedOption, number>();
     feedOptions.forEach((option, index) => map.set(option, index));
     return map;
   }, [feedOptions]);
   
   // Then use: feedIndexMap.get(feedOption) instead of findIndex
   ```

3. **Debounce/throttle visibility updates** if they're not critical for every frame

### Date Formatting Optimization

Instead of worklets, optimize date formatting with:

1. **Memoization per post:**
   ```typescript
   const formattedDate = useMemo(
     () => formatRelativeDate(dateString, showTime),
     [dateString, showTime]
   );
   ```

2. **Pre-format on server/API** - Include formatted dates in the API response

3. **Cache formatted dates** in post data structure

### Feed Deduplication Considerations

- **Set operations in worklets:** Test if `Set` is available. If not, use `Map` or array-based deduplication
- **Large feeds:** Only convert if processing 1000+ items regularly
- **Memory:** Worklets run on UI thread, but data still needs to be serialized

### Testing Checklist

Before implementing worklets for any operation:

- [ ] Profile with React Native Performance Monitor
- [ ] Measure frame rate during operation (target: 60fps)
- [ ] Test on low-end device (iPhone SE, mid-range Android)
- [ ] Verify no functionality regressions
- [ ] Check memory usage (worklets serialize data)
- [ ] Test Date/Set/Map APIs if used in worklet
- [ ] Verify `runOnJS` callbacks work correctly

---

## 📚 References

- [Reanimated Worklets Docs](https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/worklets)
- [Reanimated Performance Guide](https://docs.swmansion.com/react-native-reanimated/docs/guides/performance)
- [Reanimated Scroll Handler](https://docs.swmansion.com/react-native-reanimated/docs/advanced/useAnimatedScrollHandler)
- Current implementation examples: `VideoScrubber.tsx`, `VideoOverlayUI.tsx`

