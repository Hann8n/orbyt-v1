# Feed System Performance Audit

## Executive Summary

This audit identifies performance bottlenecks in the feed system that may cause:

- Unnecessary re-renders
- Scroll jank
- Memory leaks
- Delayed video playback
- Excessive CPU usage

## Critical Issues (High Priority)

### 1. **JSON.stringify in Memo Comparison** ⚠️ CRITICAL

**Location:** `src/components/features/feed/FeedRenderer.tsx:470`

**Issue:** Using `JSON.stringify` for deep comparison in `areEqual` function is extremely expensive and runs on every prop change check.

```typescript
if (JSON.stringify(prevProps.queryOptions) !== JSON.stringify(nextProps.queryOptions)) return false;
```

**Impact:** Can cause 10-50ms delays on every render, blocking the UI thread.

**Fix:** Use shallow comparison or a proper deep equality check library.

---

### 2. **Excessive setTimeout Calls** ⚠️ HIGH

**Location:** `src/components/features/feed/ListFeedView.tsx` (multiple locations)

**Issues:**

- Header blocking updates use 16ms timeout (lines 420-423)
- Position saving uses 300ms timeout (line 449)
- Multiple timeouts can accumulate during fast scrolling

**Impact:**

- Timeouts can queue up during rapid scrolling
- Header blocking delay causes visible lag in video playback
- Position saving delays can cause scroll position loss

**Fix:**

- Use `requestAnimationFrame` for header blocking instead of setTimeout
- Debounce position saving more aggressively
- Clear pending timeouts before creating new ones

---

### 3. **snapToOffsets Recalculation** ⚠️ HIGH

**Location:** `src/components/features/feed/ListFeedView.tsx:684-733`

**Issue:** `snapToOffsets` is recalculated every time `listData.length` changes, which happens frequently during feed updates.

**Impact:** Expensive array creation (O(n)) on every feed update, causing scroll jank.

**Fix:** Only recalculate when headerHeight or cardHeight changes, not on every listData.length change.

---

### 4. **Profile Prefetching Blocks Query** ⚠️ MEDIUM

**Location:** `src/services/FeedService.ts:636-663`

**Issue:** Profile prefetching happens inside the query function using `InteractionManager.runAfterInteractions`, but the query still waits for the promise chain.

**Impact:** Query completion is delayed, causing feed to appear slower to load.

**Fix:** Move prefetching completely outside the query function or use a fire-and-forget pattern.

---

### 5. **VideoItem Style Array Recreation** ⚠️ MEDIUM

**Location:** `src/components/features/feed/VideoItem.tsx:66`

**Issue:** Creating new style array on every render:

```typescript
const containerStyle = [styles.videoContainer, { height: itemHeight, marginVertical: 3 }];
```

**Impact:** Unnecessary object allocation on every render, causing GC pressure.

**Fix:** Memoize the style array or use StyleSheet.flatten.

---

## Moderate Issues (Medium Priority)

### 6. **Large Dependency Arrays in useMemo**

**Location:** `src/components/features/feed/FeedRenderer.tsx:160-194`

**Issue:** `feedData` useMemo has 20+ dependencies, causing frequent recalculations.

**Impact:** Unnecessary work when any feed query property changes.

**Fix:** Split into smaller memoized values or use selectors.

---

### 7. **Filtered Feed Dependency Issue**

**Location:** `src/components/features/feed/ListFeedView.tsx:305-315`

**Issue:** `reportedUrisArray` is created from Set size, but also included in filteredFeed dependencies unnecessarily.

**Impact:** Extra dependency tracking overhead.

**Fix:** Remove `reportedUrisArray` from filteredFeed dependencies (only need `reportedPostUris`).

---

### 8. **Feed Deduplication on Every Change**

**Location:** `src/hooks/useFeed.ts:156-186`

**Issue:** Feed deduplication runs on every `feedPages` change, even if pages haven't changed.

**Impact:** O(n) operation on every feed update.

**Fix:** Only deduplicate when pages actually change (use a hash or deep comparison).

---

### 9. **Header Blocking State Updates**

**Location:** `src/components/features/feed/ListFeedView.tsx:407-424`

**Issue:** State updates are throttled with 16ms timeout, but state updates still trigger re-renders.

**Impact:** Multiple re-renders during scroll, causing jank.

**Fix:** Use refs for blocking state and only update React state when it actually affects rendering.

---

### 10. **Common Props Recreation**

**Location:** `src/components/features/feed/FeedRenderer.tsx:303-355`

**Issue:** Large `commonProps` object recreated on every dependency change, even if most props are stable.

**Impact:** Unnecessary object allocation and prop passing overhead.

**Fix:** Split into stable and dynamic props, or use useMemo more selectively.

---

## Minor Issues (Low Priority)

### 11. **Orientation Change Handler**

**Location:** `src/components/features/feed/ListFeedView.tsx:609-638`

**Issue:** Uses nested `InteractionManager` + `setTimeout`, which adds unnecessary delay.

**Fix:** Simplify to single `InteractionManager` call.

---

### 12. **Empty Component Memo Comparison**

**Location:** `src/components/features/feed/ListFeedView.tsx:126-139`

**Issue:** Custom comparison function checks many props individually, but could be optimized.

**Impact:** Minor - comparison is already efficient, but could use shallow equality for objects.

---

### 13. **VideoItem areEqual Function**

**Location:** `src/components/features/feed/VideoItem.tsx:108-141`

**Issue:** Checks many props individually - could use shallow comparison for objects.

**Impact:** Minor - already optimized, but could be slightly faster.

---

## Recommendations by Priority

### Immediate Fixes (Do First)

1. Replace `JSON.stringify` in FeedRenderer memo comparison
2. Optimize `snapToOffsets` recalculation
3. Fix header blocking timeout accumulation
4. Memoize VideoItem style arrays

### Short-term Fixes (This Week)

5. Move profile prefetching outside query function
6. Optimize feedData useMemo dependencies
7. Fix filteredFeed dependencies
8. Use refs for header blocking state

### Long-term Optimizations (This Month)

9. Optimize feed deduplication
10. Split commonProps into stable/dynamic
11. Review all setTimeout usage
12. Profile and optimize renderItem callback

---

## Performance Metrics to Track

After fixes, monitor:

- Scroll FPS (should be 60fps)
- Time to first video playback
- Memory usage during scrolling
- CPU usage during feed updates
- Number of re-renders per scroll event

---

## Testing Checklist

- [ ] Test scroll performance with 100+ items
- [ ] Test rapid scrolling (flick gestures)
- [ ] Test feed updates during scroll
- [ ] Test orientation changes
- [ ] Test memory usage over time
- [ ] Test on low-end devices
- [ ] Profile with React DevTools Profiler
- [ ] Test with slow network (3G simulation)
