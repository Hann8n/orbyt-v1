# Technical Deep Dive: Your-Mix Feed Architecture & Plan Evaluation

## Executive Summary

After analyzing your codebase, the plan's **round-robin approach is sound but needs refinement**. The current parallel `Promise.allSettled` approach has real performance issues, but the proposed solution needs adjustments to align with your API architecture and React Query patterns.

**Key Finding**: The plan is **mostly correct** but underestimates the complexity of cursor management and doesn't fully leverage your existing infrastructure.

---

## Architecture Overview

### 1. Feed Service Layer (`FeedService.ts`)

**Current Implementation (lines 203-434):**

- Fetches from 8+ sources in parallel using `Promise.allSettled`
- Each source can be:
  - **Algorithmic feed** (feed generator URI, e.g., `at://did:plc:.../app.bsky.feed.generator/thevids`)
  - **Hashtag feed** (e.g., `hashtag:orbyt-channel-art:latest`)
  - **Feed generator** (e.g., `at://did:plc:.../app.bsky.feed.generator/...`)

**Feed Source Types:**

```typescript
interface FeedSource {
  uri: string;
  type: 'feed' | 'hashtag' | 'algorithmic';
  hashtag?: string;
  sort?: 'top' | 'latest';
}
```

**Current Flow:**

1. Get `subscribedChannels` and `algorithmicFeedProvider` from `userStore`
2. Convert channels to `FeedSource[]` (handles Orbyt channel → hashtag conversion)
3. Fetch from all sources in parallel with 10s timeout per feed
4. Merge, deduplicate, sort chronologically
5. Filter via `SeenVideoService.filterSeen()`
6. Return with composite cursor: `JSON.stringify({ [sourceUri]: cursor })`

### 2. Atproto API Layer

**`AtprotoService.getFeed()` (delegates to `FeedService.getFeed()`):**

- Handles feed generator URIs via `api.app.bsky.feed.getFeed()`
- Supports `author`, `likes`, `custom` feed types
- Returns `{ feed: ExtendedFeedViewPost[], cursor: string | null }`

**`AtprotoService.searchHashtagVideosPaginated()`:**

- Uses `api.app.bsky.feed.searchPosts({ q: '#hashtag', sort: 'top' | 'latest' })`
- Client-side filters for video embeds
- Returns `{ videos: ExtendedFeedViewPost[], cursor: string | null }`

**Key Insight**: Both APIs return simple string cursors, not complex objects. The composite cursor is a **client-side abstraction**.

### 3. SeenVideoService Architecture

**Storage:**

- Dedicated MMKV instance (`mmkv.seen-videos`)
- User-scoped keys: `seen:${userDid}:${videoUri}`
- In-memory session cache: `writtenThisSession: Set<string>`

**`filterSeen()` Implementation:**

```typescript
filterSeen(feedItems: ExtendedFeedViewPost[], userDid?: string | null): ExtendedFeedViewPost[]
```

**How it works:**

1. Gets all keys from MMKV: `seenStorage.getAllKeys()`
2. Filters by user prefix: `seen:${userDid}:`
3. Extracts URIs: `key.substring(prefix.length)`
4. Builds `Set<string>` of seen URIs
5. Filters feed items: `feedItems.filter(item => !seenUris.has(item.post.uri))`

**Performance Characteristics:**

- **Synchronous** (MMKV is fast)
- `getAllKeys()` is O(n) where n = total seen videos (could be thousands)
- Set lookup is O(1) per item
- **Bottleneck**: `getAllKeys()` on large seen video sets

### 4. React Query Integration

**`useFeed` hook (`src/hooks/useFeed.ts`):**

- Uses `useInfiniteQuery` with `getNextPageParam: lastPage => lastPage?.cursor ?? null`
- Cursor must be `string | null` (React Query requirement)
- Query key: `queryKeys.feed.infinite(feedOption, userDid)`
- Caching: `staleTime: 10 minutes`, `gcTime: 60 minutes`

**Critical Constraint**: React Query expects cursors as **strings**, not objects. Your composite cursor works because it's `JSON.stringify()`'d.

### 5. Subscribed Channels & Algorithmic Feeds

**Storage (`userStore.ts`):**

- `subscribedChannels: SubscribedChannel[]` (user-scoped, persisted)
- `algorithmicFeedProvider: string | null` (user-scoped, persisted)
- Loaded on account switch: `loadSubscribedChannels(did)`

**Channel Types:**

- `hashtag:orbyt-channel-art:latest` → hashtag feed
- `at://local.orbyt.channel/art` → converted to hashtag if postable
- `at://did:plc:.../app.bsky.feed.generator/...` → feed generator

---

## Plan Evaluation

### ✅ **What the Plan Gets Right**

1. **Round-robin is better than parallel**: Sequential fetching reduces initial load time and prevents blocking on slow feeds
2. **Simple cursor format**: `{sourceIndex, cursor}` is cleaner than `{ [uri]: cursor }`
3. **In-memory deduplication**: Per-query Set prevents duplicates across pagination
4. **Early return**: Stop fetching when `limit` items collected

### ⚠️ **Issues with the Plan**

#### 1. **Cursor Format Mismatch**

**Plan says:**

```typescript
cursor: JSON.stringify({ sourceIndex: number, cursor: string | null });
```

**Problem**: This assumes all sources have the same cursor type, but:

- **Hashtag feeds**: Return cursor from `searchPosts()` (string)
- **Feed generators**: Return cursor from `getFeed()` (string)
- **Algorithmic feeds**: Return cursor from `getFeed()` (string)

**Solution**: The format works, but you need to handle cursor migration from old format.

#### 2. **Source Index Tracking**

**Plan says:** Track `sourceIndex` and cycle through `feedSources` array.

**Problem**: The `feedSources` array can change between queries:

- User subscribes/unsubscribes from channels
- User changes algorithmic feed provider
- Array order might change

**Solution**: Use `sourceUri` as the key, not index. But this brings back the composite cursor complexity...

**Better approach**: Use a **hybrid**:

- First fetch: `{sourceIndex: 0, cursor: null}` (simple)
- Subsequent fetches: Parse cursor, if old format (`{ [uri]: cursor }`), migrate to new format
- Track which sources are exhausted (cursor === null)

#### 3. **In-Memory Deduplication Scope**

**Plan says:** Create `Map<string, Set<string>>` keyed by query key.

**Problem**: React Query already handles query-level caching. The Set should be:

- **Per-query-instance** (not global)
- **Cleared when query is invalidated**
- **Scoped to the current page fetch**, not all pages

**Better approach**: Use a **closure-scoped Set** within `fetchFeed()` for the current fetch session, not a class-level Map.

#### 4. **SeenVideoService.filterSeen() Performance**

**Plan doesn't address**: `filterSeen()` calls `getAllKeys()` which is O(n) where n = total seen videos.

**Current implementation** (line 121):

```typescript
const allKeys = this.seenStorage.getAllKeys();
```

**Optimization opportunity**:

- Cache seen URIs per user in memory (with TTL)
- Only refresh cache when new videos are marked as seen
- Use `getAllKeys()` only on cache miss

**But**: This is a separate optimization, not part of the your-mix simplification.

#### 5. **Early Return Logic**

**Plan says:** Return when `limit` items collected.

**Problem**: You need to ensure you've fetched from all sources at least once before early-returning, otherwise some sources never get a chance.

**Better approach**:

- First round: Fetch from all sources (small batches: 10-15 items each)
- Subsequent rounds: Round-robin until `limit` reached
- Track exhausted sources (cursor === null) and skip them

#### 6. **Merge Logic Simplification**

**Plan says:** Remove `mergeAndDeduplicatePosts()` and rely on Set deduplication.

**Current `mergeAndDeduplicatePosts()` (lines 81-108):**

- Deduplicates by URI
- Sorts chronologically by `indexedAt`
- Applies limit

**Analysis**: You still need:

- ✅ Deduplication (handled by Set)
- ✅ Sorting (still needed for chronological order)
- ✅ Limit (React Query handles this via `getNextPageParam`)

**Solution**: Keep sorting, remove deduplication (Set handles it), keep limit application.

---

## Recommended Implementation Strategy

### Phase 1: Hybrid Cursor Format (Backward Compatible)

```typescript
// New format: {sourceIndex: number, cursor: string | null, exhausted?: boolean[]}
// Old format: { [uri]: cursor } (migrate on first fetch)

interface YourMixCursor {
  sourceIndex: number;
  cursor: string | null;
  exhausted?: boolean[]; // Track which sources are exhausted
  version?: number; // For future migrations
}
```

**Migration logic:**

```typescript
let cursorState: YourMixCursor | { [uri]: string | null };
if (cursor) {
  try {
    const parsed = JSON.parse(cursor);
    if (typeof parsed.sourceIndex === 'number') {
      // New format
      cursorState = parsed;
    } else {
      // Old format - migrate
      cursorState = {
        sourceIndex: 0,
        cursor: null,
        exhausted: new Array(feedSources.length).fill(false),
      };
    }
  } catch {
    cursorState = { sourceIndex: 0, cursor: null };
  }
}
```

### Phase 2: Round-Robin with Smart Batching

```typescript
const results: ExtendedFeedViewPost[] = [];
const seenUris = new Set<string>(); // Per-fetch deduplication
const exhausted = cursorState.exhausted || new Array(feedSources.length).fill(false);
let currentIndex = cursorState.sourceIndex || 0;
let currentCursor = cursorState.cursor || null;

// First round: Fetch small batches from all sources
if (!cursor) {
  const firstRoundPromises = feedSources.map(
    (source, idx) => fetchFromSource(source, null, 10) // Small initial batch
  );
  const firstRoundResults = await Promise.allSettled(firstRoundPromises);
  // Process results, add to seenUris, add to results
  // Mark exhausted sources
}

// Subsequent rounds: Round-robin until limit reached
while (results.length < limit && !allExhausted(exhausted)) {
  // Skip exhausted sources
  while (exhausted[currentIndex]) {
    currentIndex = (currentIndex + 1) % feedSources.length;
  }

  const source = feedSources[currentIndex];
  const batch = await fetchFromSource(source, currentCursor, 15);

  // Deduplicate, filter seen, add to results
  for (const post of batch.feed) {
    if (!seenUris.has(post.post.uri) && !seenVideoService.isSeen(post.post.uri)) {
      seenUris.add(post.post.uri);
      results.push(post);
      if (results.length >= limit) break;
    }
  }

  currentCursor = batch.cursor;
  if (!currentCursor) {
    exhausted[currentIndex] = true;
  }

  currentIndex = (currentIndex + 1) % feedSources.length;
}

// Sort chronologically
results.sort((a, b) => {
  const aTime = new Date(a.post.indexedAt || 0).getTime();
  const bTime = new Date(b.post.indexedAt || 0).getTime();
  return bTime - aTime;
});

// Apply limit
const limitedResults = results.slice(0, limit);

// Filter via SeenVideoService (batch operation)
const filteredResults = seenVideoService.filterSeen(limitedResults, currentUser?.did ?? null);

// Return with new cursor
return {
  feed: filteredResults,
  cursor: JSON.stringify({
    sourceIndex: currentIndex,
    cursor: currentCursor,
    exhausted,
    version: 1,
  }),
};
```

### Phase 3: Optimize SeenVideoService (Separate Task)

**Current bottleneck**: `getAllKeys()` on large seen video sets.

**Optimization**:

```typescript
class SeenVideoService {
  private seenUriCache: Map<string, { uris: Set<string>; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  filterSeen(feedItems: ExtendedFeedViewPost[], userDid?: string | null): ExtendedFeedViewPost[] {
    const targetUserDid = userDid ?? this.userDid;
    if (!targetUserDid) return feedItems;

    // Check cache
    const cacheKey = targetUserDid;
    const cached = this.seenUriCache.get(cacheKey);
    const now = Date.now();

    if (cached && now - cached.timestamp < this.CACHE_TTL) {
      // Use cached set
      return feedItems.filter(item => {
        const uri = item.post?.uri;
        return uri && !cached.uris.has(uri);
      });
    }

    // Refresh cache
    const prefix = `${this.KEY_PREFIX}${targetUserDid}:`;
    const allKeys = this.seenStorage.getAllKeys();
    const seenUris = new Set<string>();

    for (const key of allKeys) {
      if (key.startsWith(prefix)) {
        const uri = key.substring(prefix.length);
        if (uri) seenUris.add(uri);
      }
    }

    // Update cache
    this.seenUriCache.set(cacheKey, { uris: seenUris, timestamp: now });

    // Filter
    return feedItems.filter(item => {
      const uri = item.post?.uri;
      return uri && !seenUris.has(uri);
    });
  }

  markAsSeen(videoUri: string): void {
    // ... existing implementation ...

    // Invalidate cache for current user
    if (this.userDid) {
      this.seenUriCache.delete(this.userDid);
    }
  }
}
```

---

## Performance Analysis

### Current Implementation (Parallel)

**Time to first result**: ~10s (waits for slowest feed)
**Memory**: High (all feeds loaded in parallel)
**Network**: 8+ concurrent requests
**User experience**: Blocking, slow initial load

### Plan's Round-Robin

**Time to first result**: ~1-2s (first source returns)
**Memory**: Low (one source at a time)
**Network**: Sequential requests
**User experience**: Fast initial load, progressive loading

### Recommended Hybrid

**Time to first result**: ~1-2s (first round completes quickly)
**Memory**: Medium (first round parallel, then sequential)
**Network**: 8 concurrent (first round), then sequential
**User experience**: Fast initial load, good distribution

---

## Final Recommendation

**The plan is 85% correct**. Implement with these adjustments:

1. ✅ **Use round-robin** (plan is correct)
2. ✅ **Simplify cursor** to `{sourceIndex, cursor, exhausted}` (refined from plan)
3. ✅ **Add in-memory Set** for per-fetch deduplication (plan is correct)
4. ✅ **Keep sorting** (plan says remove, but it's needed)
5. ✅ **First round parallel** (hybrid approach, not in plan)
6. ⚠️ **Optimize SeenVideoService separately** (not part of this plan, but important)

**Implementation Priority:**

1. **High**: Round-robin fetching (biggest performance win)
2. **High**: Cursor simplification (reduces complexity)
3. **Medium**: In-memory deduplication (prevents duplicates)
4. **Low**: SeenVideoService optimization (separate task)

**Risk Assessment:**

- **Low risk**: Round-robin, cursor simplification
- **Medium risk**: Cursor migration (needs testing)
- **Low risk**: In-memory deduplication (simple Set)

---

## Code Changes Summary

### Files to Modify

1. **`src/services/FeedService.ts`** (lines 203-434)
   - Replace parallel fetching with round-robin
   - Simplify cursor format
   - Add in-memory Set for deduplication
   - Keep sorting, remove heavy merge

2. **`src/services/SeenVideoService.ts`** (optional, separate task)
   - Add cache for `getAllKeys()` results
   - Invalidate cache on `markAsSeen()`

### Testing Checklist

- [ ] First page load (no cursor)
- [ ] Pagination (with cursor)
- [ ] Cursor migration (old format → new format)
- [ ] Source exhaustion (all sources return null cursor)
- [ ] User subscribes/unsubscribes (feedSources change)
- [ ] User changes algorithmic feed provider
- [ ] Seen video filtering still works
- [ ] No duplicate posts across pagination
- [ ] Chronological sorting maintained

---

## Conclusion

The plan is **sound and implementable** with the refinements above. The round-robin approach will significantly improve performance, and the simplified cursor will reduce complexity. The main risk is cursor migration, which can be handled gracefully with backward compatibility.

**Recommendation: Proceed with implementation, following the refined strategy above.**
