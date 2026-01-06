# Moderation Architecture Analysis

## Current Architecture

### How Moderation Currently Works

1. **Data Flow:**
   - `FeedService.fetchFeed()` fetches posts from API
   - After fetching, calls `ModerationService.batchModeratePosts()`
   - Moderation service:
     - Fetches user preferences from API (async)
     - Reads `postView.labels` and `postView.record.text` from each post
     - Computes `ModerationDecision` (filter, blur, informs, reason)
     - Caches decisions in memory Map
     - Attaches decisions to posts as `moderationDecision` property
   - Components receive `moderationDecision` as a prop

2. **Current Dependencies:**
   - Async API call to fetch user preferences (`getModerationSettings`)
   - In-memory cache for moderation decisions
   - In-memory cache for moderation settings
   - Separate service layer (`ModerationService`)

### Data Available in Post Types

From `PostView` and `FeedViewPost` (already in your types):

```typescript
PostView {
  uri: string;
  cid: string;
  author: ProfileViewBasic;
  record: PostRecord; // Contains text content
  labels?: Label[];   // ✅ Already available!
  viewer?: ViewerState; // ✅ Contains blocking/muting info
  embed?: VideoView | ImagesView | RecordWithMediaView;
  // ... other fields
}
```

**Key Insight:** All the data needed for moderation (`labels`, `record.text`, `viewer`) is **already in the post data** from the API.

## Benefits of Moving to Post Data Types Directly

### 1. **Eliminate Async Overhead**

- **Current:** Async call to `getModerationSettings()` for every batch
- **Proposed:** Settings cached in React Query, computed synchronously
- **Benefit:** Faster feed rendering, no blocking on moderation

### 2. **Simpler Architecture**

- **Current:** Separate service layer with caching, async operations
- **Proposed:** Pure function that takes post + settings, returns decision
- **Benefit:** Easier to test, debug, and maintain

### 3. **Better Type Safety**

- **Current:** Moderation reads from post but types aren't enforced
- **Proposed:** Use PostView types directly with proper type guards
- **Benefit:** TypeScript catches errors at compile time

### 4. **Reduced Memory Footprint**

- **Current:** In-memory cache for decisions + settings
- **Proposed:** Decisions computed on-demand, settings in React Query cache
- **Benefit:** Less memory usage, especially for large feeds

### 5. **More Aligned with AT Protocol**

- **Current:** Custom abstraction layer
- **Proposed:** Direct use of AT Protocol types and data
- **Benefit:** Easier to keep up with protocol changes

### 6. **Better Performance for Videos**

- **Current:** Batch moderation happens after fetch, blocking render
- **Proposed:** Moderation computed during render (memoized)
- **Benefit:** Videos can start loading immediately

## Potential Challenges

### 1. **Settings Still Need to be Fetched**

- User preferences still come from API
- **Solution:** Use existing `useModerationSettings()` hook (React Query)
- Settings are cached, so this is already optimized

### 2. **Component-Level Computation**

- Decisions computed in components vs. service
- **Solution:** Create `useModerationDecision(post)` hook
- Memoize computation to avoid recalculation

### 3. **Backward Compatibility**

- Components currently expect `moderationDecision` prop
- **Solution:** Compute in hook, pass as prop (same interface)

## Recommended Approach

### Option 1: Hybrid (Recommended)

Keep settings management in service, compute decisions from post data:

```typescript
// New hook: useModerationDecision.ts
export function useModerationDecision(post: ExtendedPostView | ExtendedFeedViewPost) {
  const postView = 'post' in post ? post.post : post;
  const { data: settings } = useModerationSettings();

  return useMemo(() => {
    if (!settings || !postView) {
      return { filter: false, blur: false, informs: [] };
    }

    // Compute from post data directly
    const labels = postView.labels || [];
    const text = extractText(postView.record);

    return computeModerationDecision(labels, text, settings);
  }, [postView, settings]);
}
```

**Benefits:**

- ✅ Uses post data types directly
- ✅ Leverages React Query for settings
- ✅ Memoized for performance
- ✅ Minimal code changes

### Option 2: Pure Function (More Radical)

Move all logic to pure functions, eliminate service:

```typescript
// utils/moderation/computeDecision.ts
export function computeModerationDecision(
  post: ExtendedPostView,
  settings: ModerationSettings
): ModerationDecision {
  const labels = post.labels || [];
  const text = extractText(post.record);
  // ... computation logic
}
```

**Benefits:**

- ✅ No service layer
- ✅ Fully synchronous
- ✅ Easier to test
- ⚠️ Requires more refactoring

## Impact Analysis

### Code Changes Required

**Minimal (Option 1):**

- Create `useModerationDecision` hook (~50 lines)
- Update components to use hook instead of prop
- Remove `batchModeratePosts` from FeedService
- Keep settings management in ModerationService

**Files to Modify:**

- `src/hooks/useModerationDecision.ts` (new)
- `src/services/FeedService.ts` (remove batch moderation)
- `src/components/features/feed/VideoItem.tsx`
- `src/components/features/video/VideoCard.tsx`
- `src/components/features/chat/EmbeddedPostCard.tsx`

### Performance Impact

**Positive:**

- ⚡ Faster initial render (no blocking on moderation)
- ⚡ Better memory usage (no decision cache)
- ⚡ Videos can load immediately

**Potential Concerns:**

- Computation happens during render (but memoized)
- Settings still need to be fetched (but cached)

### Risk Assessment

**Low Risk:**

- Post data structure is stable (AT Protocol)
- Settings are already cached via React Query
- Can be done incrementally

**Medium Risk:**

- Need to ensure memoization is correct
- Need to handle edge cases (missing labels, etc.)

## Recommendation

**Yes, moving to post data types directly would be a significant benefit.**

The current centralized moderation service adds unnecessary complexity:

- It duplicates data already in posts
- It adds async overhead
- It requires separate caching

**Suggested Implementation:**

1. Create `useModerationDecision` hook (Option 1)
2. Update components to use hook
3. Remove batch moderation from FeedService
4. Keep settings management (already optimized with React Query)

This would:

- ✅ Reduce code complexity
- ✅ Improve performance
- ✅ Better align with AT Protocol design
- ✅ Maintain type safety

The only thing that still needs to be fetched is user preferences, which is already optimized with React Query caching.
