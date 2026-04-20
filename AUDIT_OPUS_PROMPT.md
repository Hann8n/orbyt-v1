# Orbyt App — Architecture & Performance Audit Prompt for Claude Opus

You are a senior React Native / Expo engineer conducting a deep architectural review and implementing targeted improvements on a production video app called **Orbyt**. Orbyt is a Bluesky / AT Protocol video client built with Expo SDK 55, React 19 (with React Compiler), React Native 0.83, Expo Router v3, TanStack React Query v5, Zustand v5, MMKV, Reanimated 4, FlashList v2, and `expo-video` for playback.

The codebase is well-structured and uses appropriate SDKs for most things. Your job is to resolve a specific set of confirmed issues found during a thorough audit — in priority order. For each issue, verify the problem in the listed file(s), implement the fix, and verify nothing is broken. Prefer SDK-native solutions over custom client-side work wherever possible.

---

## Priority 1 — Performance Critical

### 1.1 Dynamic `import()` of `userStore` on every API call (hot path)

**Files:** `src/services/api/core.ts`, `src/services/api/feed/feedInteractions.ts`

**Problem:** `AtprotoCore.getApiClient()`, `getCurrentUserDid()`, and `ensureSession()` all execute `const { useUserStore } = await import('../../stores/userStore')` inside the function body. This fires on every single API request. While Node/Hermes caches the module after the first resolution, the async `import()` call is still evaluated and awaited on every request, adding unnecessary microtask overhead on the hottest path in the app. `feedInteractions.ts::sendVideoFeedback` has the same pattern.

**Root cause:** These dynamic imports were introduced to break a circular dependency between `core.ts` ↔ `userStore.ts`. The actual fix is to restructure the dependency graph:

**Fix strategy:**

- Create a tiny `agentBridge.ts` module (no imports from userStore) that exports a mutable `{ agent: Agent | null }` singleton and an `setAgent(agent: Agent | null)` setter.
- `userStore.ts` imports `agentBridge` and calls `setAgent(agent)` whenever the `agent` field changes in the store (in its set() call for auth actions).
- `core.ts` imports `agentBridge` statically and reads `agentBridge.agent` synchronously — no dynamic import, no async, no await needed.
- Delete all `await import('../../stores/userStore')` calls inside the service layer.

This turns every `getApiClient()` call from `async + dynamic import + subscribe` into a simple synchronous property read.

---

### 1.2 `SeenVideoService.filterSeen` is O(n) on every feed page

**File:** `src/services/SeenVideoService.ts` — `filterSeen()` and `markAsSeen()`

**Problem:** Every time a feed page loads, `filterSeen` calls `this.seenStorage.getAllKeys()` which scans the entire MMKV instance and returns all keys as a JS array. As the user watches videos over weeks, this list grows unboundedly. The method then iterates over every key to build a `Set<string>`. This is O(n) on the number of lifetime-seen videos per page load — potentially thousands of iterations for long-time users.

**Fix strategy:**

- Add a private `seenUriCache: Set<string> | null = null` field to the class.
- On first call to `filterSeen` or `isSeen`, lazily initialize the cache by calling `getAllKeys()` once and populating the Set.
- In `markAsSeen`, update both MMKV and the in-memory `seenUriCache` Set simultaneously (if initialized).
- In `setUserDid`, reset `seenUriCache = null` so it reinitializes for the new user.
- `filterSeen` now checks the in-memory Set directly — O(1) per item, O(m) total where m = feed page size.

---

### 1.3 `VideoItem` creates a new object reference on every render, defeating `memo` on `VideoCard`

**File:** `src/components/features/feed/VideoItem.tsx`

**Problem:** On every render of `VideoItem`, the line:

```ts
const normalizedPost = { ...post, embed: videoView } as VideoCardPost;
```

creates a new object with a new reference. `VideoCard` is wrapped in `React.memo`, but because `normalizedPost` is a new object reference every render, `memo` never short-circuits and `VideoCard` always re-renders when its parent does — even when `post` and `videoView` haven't changed.

**Fix strategy:** Wrap `normalizedPost` in `useMemo`:

```ts
const normalizedPost = useMemo(
  () => ({ ...post, embed: videoView }) as VideoCardPost,
  [post, videoView]
);
```

This requires adding `useMemo` to the React import in `VideoItem.tsx`.

---

### 1.4 Multiple separate Zustand subscriptions per component in hot-path components

**Files:** `src/hooks/useFeed.ts`, `src/components/features/video/VideoCard.tsx`

**Problem — `useFeed.ts`:** Six separate `useUserStore(state => ...)` calls create six independent store subscriptions. Every time any of these six fields changes in the store, React schedules a re-render for every component using `useFeed`. With multiple feeds mounted simultaneously (tab pager), this multiplies the re-renders.

```ts
const currentUser = useUserStore(state => state.currentUser);
const isSwitchingAccount = useUserStore(state => state.isSwitchingAccount);
const feedSourceFingerprint = useUserStore(state => state.feedSourceFingerprint);
const feedBootstrapStatus = useUserStore(state => state.feedBootstrapStatus);
const feedBootstrapDid = useUserStore(state => state.feedBootstrapDid);
const agent = useUserStore(state => state.agent);
```

**Problem — `VideoCard.tsx`:** `useUserStore`, `usePostInteractionStore` (called twice), and `useFollowStore` are all separate subscriptions inside a component that renders once per video in the feed — potentially 50+ times.

**Fix strategy:** Use Zustand's `useShallow` (v5: `import { useShallow } from 'zustand/react/shallow'`) to combine multiple field reads into one subscription:

```ts
// useFeed.ts — replace 6 separate calls with one:
const {
  currentUser,
  isSwitchingAccount,
  feedSourceFingerprint,
  feedBootstrapStatus,
  feedBootstrapDid,
  agent,
} = useUserStore(
  useShallow(state => ({
    currentUser: state.currentUser,
    isSwitchingAccount: state.isSwitchingAccount,
    feedSourceFingerprint: state.feedSourceFingerprint,
    feedBootstrapStatus: state.feedBootstrapStatus,
    feedBootstrapDid: state.feedBootstrapDid,
    agent: state.agent,
  }))
);
```

Apply the same pattern to `VideoCard` for its multi-field store reads.

---

## Priority 2 — Architectural Design Issues

### 2.1 `AtprotoService.tsx` is a 970-line pass-through facade with no added value

**File:** `src/services/api/AtprotoService.tsx`

**Problem:** `AtprotoService` is a class with ~60 static methods, each of which is a one-liner that delegates to a sub-service (`AtprotoFeedService`, `ActorService`, `GraphService`, etc.). There is no caching, error normalization, batching, or any other logic added. The class exists purely to re-export. This creates three problems:

1. **Tree-shaking is broken** — any caller importing `AtprotoService` for a single method loads the entire 970-line file plus all sub-service imports.
2. **It's a maintenance trap** — every new method added to a sub-service requires a corresponding delegation method here.
3. **It has a `@deprecated` public method** (`reportContent`) alongside non-deprecated ones, creating confusion.

**Fix strategy:**

- Remove `AtprotoService.tsx` as the primary interface.
- Update all import sites to import directly from the relevant sub-service (`AtprotoFeedService`, `ActorService`, `GraphService`, etc.).
- Keep a minimal `AtprotoService` export only if needed for backward compatibility during migration, but mark the entire class `@deprecated` with a JSDoc pointing to the direct import paths.
- Run `knip` (already in the toolchain: `yarn deps:knip`) after the migration to confirm no orphan imports remain.

This is a non-trivial refactor. Use the `Grep` tool to find all import sites of `AtprotoService` before starting, and migrate file-by-file.

---

### 2.2 `useUnreadCount` makes a fresh conversations network request instead of sharing the cache

**File:** `src/hooks/useUnreadCount.ts`

**Problem:** `useUnreadCount` calls `ChatService.listConvos(null)` directly inside its `queryFn`. The ChatsTab almost certainly also fetches conversations via a React Query query with its own key. These two queries use different query keys and therefore make separate network requests for the same data. The unread count query fetches 50 conversations purely to sum up `unreadCount` fields — it should share the already-cached conversations data.

**Fix strategy:**

- In `useUnreadCount`, change the `queryFn` to use `queryClient.getQueryData(queryKeys.chat.conversations.list())` to read the conversations list from cache instead of fetching.
- If the cached data is absent, fall back to calling `ChatService.listConvos(null)` once.
- Alternatively, use `useQuery` with the same query key as ChatsTab (`queryKeys.chat.conversations.list()`) so React Query deduplicates the network request entirely. The `select` option can then sum `unreadCount` from the result.
- Note: there is no `chat.bsky.convo.getUnreadMessageCount` endpoint in the AT Protocol lexicon — the current approach of summing from `listConvos` is the correct protocol pattern, but the query should be shared with the ChatsTab query rather than duplicated.

---

### 2.3 `VideoCard` uses `useEffect` to sync derived state — anti-pattern

**File:** `src/components/features/video/VideoCard.tsx` — the `useEffect` that syncs `persistedInteraction` to `overlayState`

**Problem:** The component has a `useEffect` that copies `persistedInteraction` fields into `overlayState` whenever `persistedInteraction` changes. This is the React "derived state via useEffect" anti-pattern, which:

- Causes an extra render cycle (state change → render → effect → setState → render again)
- Can produce stale intermediate renders where `overlayState` is one frame behind `persistedInteraction`
- Makes the data flow hard to reason about

The intent is to merge server-derived interaction counts with optimistic local updates (`isLikePending`, `isRepostPending`). This should be derived synchronously.

**Fix strategy:**

- Remove the `useEffect` that syncs `persistedInteraction` to `overlayState`.
- Instead, keep `overlayState` only for the optimistic pending flags (`isLikePending`, `isRepostPending`) and user-initiated transient state.
- Derive the final display values by merging inline in the render:
  ```ts
  const displayInteraction = {
    ...persistedInteraction,
    ...(overlayState.isLikePending
      ? { isLiked: optimisticLiked, likeCount: optimisticLikeCount }
      : {}),
    ...(overlayState.isRepostPending
      ? { isReposted: optimisticReposted, repostCount: optimisticRepostCount }
      : {}),
  };
  ```
- This makes the overlay state single-source-of-truth for pending-only flags, and `persistedInteraction` (derived from store) is the source of truth for actual counts.

---

### 2.4 `FeedRenderer.memoizedQueryOptions` recreates on every render

**File:** `src/components/features/feed/FeedRenderer.tsx`

**Problem:** The component uses an inline IIFE pattern to compute `memoizedQueryOptions`:

```ts
const memoizedQueryOptions = (() => { ... })();
```

Despite the name "memoized", this runs on every render and creates a new object every time. This causes `useFeed` to receive a new options reference on every render.

**Note:** With React Compiler active (this project uses `eslint-plugin-react-compiler`), the compiler may already handle this. Verify by checking the compiled output or React DevTools. If the compiler is not yet handling it, wrap in `useMemo`:

```ts
const memoizedQueryOptions = useMemo(() => {
  const { enabled: providedEnabled, ...restOptions } = queryOptions ?? {};
  const computedEnabled = typeof providedEnabled === 'boolean' ? providedEnabled : !isSearchFeed;
  return { enabled: computedEnabled, ...restOptions };
}, [queryOptions, isSearchFeed]);
```

---

## Priority 3 — SDK Upgrade Opportunities

### 3.1 `react-native-vision-camera` — stable v5 + lifecycle hygiene (resolved direction)

**File:** `package.json`, `app/create.tsx`, any file importing from `react-native-vision-camera`

**Status:** The app pins **`react-native-vision-camera@^5.0.1`** (stable v5) with **`react-native-nitro-modules`** and **`react-native-nitro-image`**, per upstream v5 requirements. The old “beta.8 / downgrade to v4.7.3 / migrate to expo-camera” guidance is **obsolete**.

**Why stay on VisionCamera v5:** Create uses **`useVideoOutput`**, **`createRecorder`**, Reanimated-driven zoom (SharedValue → **`cameraRef.current.controller.setZoom`** via `useAnimatedReaction`, avoiding the optional **`react-native-vision-camera-worklets`** native add-on), native tap-to-focus, torch, and multi-segment recording orchestration — a better fit than swapping to `expo-camera` without a full product decision.

**Ongoing hygiene (not a version migration):** Follow [VisionCamera lifecycle](https://visioncamera.margelo.com/docs/lifecycle) — prefer **`isActive`** over tearing down `<Camera />` when possible; use **`onConfigured`** on `<Camera />` so outputs are ready before `createRecorder`; keep **`freezeOnBlur: false`** on the create stack screen where the session must not freeze. Re-audit after major Expo / VisionCamera bumps.

---

### 3.2 Leverage `expo-video` preloading for next-video buffering

**Files:** `src/utils/video/helpers.ts`, `src/components/features/feed/ListFeedView.tsx` (or wherever the next item is known)

**Problem / Opportunity:** `expo-video` SDK 55 supports preloading: creating a `VideoPlayer` instance without attaching it to a `VideoView` causes it to begin buffering immediately. The current implementation creates a player per visible item only. The next video in the feed could be preloaded when the user is within ~1 item of it, dramatically reducing perceived load time when snapping to the next video.

**Implementation guidance:**

- `expo-video`'s `useVideoPlayer` hook accepts a source and immediately starts buffering when called. A "preload player" can be created for `feedItems[currentIndex + 1]` while the current video is playing.
- Use the `bufferOptions` property on the player:
  ```ts
  player.bufferOptions = {
    preferredForwardBufferDuration: 5, // 5 seconds ahead
    waitsToMinimizeStalling: true,
  };
  ```
  The default `preferredForwardBufferDuration` is platform-specific; setting it explicitly improves buffering consistency.
- When the user snaps to the next item, the preloaded player already has buffers filled — pass it as the player source instead of creating a new one.
- Implement this as a hook (`useVideoPreloader`) that takes the current index and feed items, manages 1 ahead-player, and returns it for the next item.
- Ensure the preload player is released (call `player.release()`) when no longer needed to avoid memory leaks.

---

### 3.3 Remove FFprobe/FFmpegKit for video metadata — use Expo SDK instead

**File:** `src/services/video/VideoProcessingService.ts` — `getVideoDurationFromFile()` and parts of `getVideoInfo()`

**Problem:** `VideoProcessingService.getVideoDurationFromFile` uses FFprobeKit (via `ffmpeg-kit-react-native`) to read video duration. `ffmpeg-kit-react-native` is an extremely heavy dependency (~40MB on Android). Where possible, video metadata should be retrieved via lighter Expo SDK APIs:

- **Duration**: `expo-media-library`'s `getAssetInfoAsync()` already returns `duration` for library assets. For files not in the library, `expo-video`'s `useVideoPlayer` exposes `player.duration` after the video loads. Both are SDK-native and do not require FFprobe.
- **Dimensions/metadata**: `ImagePicker.ImagePickerAsset` already contains `width`, `height`, `duration`, and `fileSize` — this data is available before any FFprobe call.
- **HDR detection**: Not reliably available via Expo SDK today — this specific use case may still require FFprobe.

**Fix strategy:**

1. In `getVideoDurationFromFile`, check if `asset?.duration` is available first (it usually is when coming from the image picker). Only fall back to FFprobe if the asset duration is 0 or undefined.
2. In `getVideoInfo`, use `asset.width`, `asset.height`, `asset.duration`, and `asset.fileSize` directly before calling any FFprobe commands.
3. The FFmpeg dependency is still legitimately needed for: video segment merging, trimming, and HDR-to-SDR conversion. Do not remove it entirely — just reduce its usage to those operations.

---

### 3.4 Enable `refetchOnReconnect` for stale-data recovery

**File:** `src/utils/query/queryClient.ts`

**Problem:** The global React Query client has `refetchOnReconnect: false`. When a user loses network and regains it, all queries remain stale indefinitely. The React Query lifecycle bridge in `app/_layout.tsx` already handles app foreground/background transitions, but network reconnection is a separate event. A user who goes offline, then comes back online, will see whatever data was last loaded with no automatic refresh.

**Fix strategy:**

- Change the global default to `refetchOnReconnect: 'always'` (or `true`).
- For queries where re-fetching on reconnect is undesirable (e.g., large feed pages that have scrolled far), override at the query level with `refetchOnReconnect: false`.
- The feed infinite queries already have `refetchOnMount: false` and `refetchOnWindowFocus: false` — keep those as-is; only enable reconnect refetch.
- Test the behavior by simulating airplane mode in the simulator: data should refresh when connectivity is restored.

---

## Priority 4 — Code Quality / Maintenance

### 4.1 `sendVideoFeedback` uses dynamic `import()` inside async function body

**File:** `src/services/api/feed/feedInteractions.ts` — `sendVideoFeedback()`

**Problem:** Inside `sendVideoFeedback`, there is:

```ts
const { useUserStore } = await import('../../../stores/userStore');
const { ALGORITHMIC_FEED_PROVIDERS } = await import('../../../utils/constants');
```

`ALGORITHMIC_FEED_PROVIDERS` is a constant from `constants.ts` — it has no circular dependency risk and should be a static import at the top of the file. `useUserStore` has the same circular dependency issue as `AtprotoCore` — resolve via the `agentBridge.ts` pattern from Issue 1.1 or by passing the required store value (`algorithmicFeedProvider`) as a parameter to `sendVideoFeedback`.

The cleanest fix for `sendVideoFeedback` is to add `algorithmicFeedProvider: string | null` as an optional parameter, populated by the caller which already has access to the store. This eliminates the store import entirely from the service layer.

---

### 4.2 `AtprotoService.getVideoFeedback` does raw `JSON.parse` without validation

**File:** `src/services/api/AtprotoService.tsx` — `getVideoFeedback()` and `sendVideoFeedback()`

**Problem:** `getVideoFeedback` reads a JSON string from MMKV and calls `JSON.parse(feedbackStr)` with no type validation. If the stored JSON has an unexpected shape (e.g., from a previous app version), this silently returns a malformed object typed as the expected response. Similarly, the feedback is stored via `JSON.stringify` in `feedInteractions.ts::sendVideoFeedback`, creating a fragile storage contract split across two files.

**Fix strategy:**

- Move video feedback storage to a dedicated typed helper with a Zod schema or a simple manual shape check.
- Alternatively, since video feedback is already sent to the AT Protocol API immediately (see `sendFeedInteractions`), evaluate whether local MMKV persistence of feedback is even needed at all. If the API is the source of truth, the local MMKV storage adds complexity without benefit.

---

### 4.3 `prefetchColorsForUser` fetches 100 following on every login — consider deferral

**File:** `src/stores/userStore.ts` — `prefetchColorsForUser()`

**Problem:** On every sign-in or session restore, `prefetchColorsForUser` calls `GraphService.getFollowing(userDid, null, 100)` to get the user's following list, then `prefetchOrbytColors` for up to 100 DIDs. This is a significant network burst on the auth path. While it runs non-blocking, it competes with the initial feed load for bandwidth.

**Fix strategy:**

- Defer `prefetchColorsForUser` until after the first successful feed render using `requestIdleCallback` (already used elsewhere in the app) or by checking `feedBootstrapStatus === 'ready'` before initiating the prefetch.
- Consider rate-limiting the prefetch: only run it if the last prefetch was more than 1 hour ago (store timestamp in MMKV).
- The persisted colors from MMKV (`loadPersistedColors`) are already loaded synchronously on startup — the prefetch is only needed for freshness. It does not need to be immediate.

---

## Implementation Notes

**React Compiler awareness:** This project uses `eslint-plugin-react-compiler` which suggests the React Compiler is active (or being evaluated). Verify in `babel.config.js` whether `babel-plugin-react-compiler` is enabled. If it is, some manual `useMemo`/`useCallback` additions (Issues 1.3, 2.4) may be redundant — the compiler handles them automatically. However, Issues 1.1, 1.2, 2.2, and 2.3 are architectural, not memoization issues, and are unaffected by the compiler.

**Testing approach for each fix:**

1. After Issue 1.1 (agentBridge): Verify that login → API call flow works end-to-end. Check that token refresh still works correctly (the agent returned by the bridge must be the same OAuth-managed agent from the store).
2. After Issue 1.2 (SeenVideoService): Test with a large seen-video MMKV store. Verify that videos marked as seen are correctly filtered and that account switching clears the cache.
3. After Issue 1.3 (VideoItem memo): Use React DevTools Profiler to confirm VideoCard no longer re-renders when parent re-renders with unchanged props.
4. After Issue 2.1 (AtprotoService removal): Run `yarn type-check` and `yarn lint` to catch all broken import sites. Use `knip` to confirm no dead code remains.
5. After Issue 3.1 (VisionCamera v5 lifecycle): Full create flow test on both iOS and Android, including multi-segment recording if applicable.

**Do not change:** The AT Protocol polling approach in `useChatLogPolling` is architecturally correct — `chat.bsky.convo.getLog` is a cursor-based HTTP query endpoint, not a WebSocket subscription. The polling with exponential backoff is the prescribed approach per the AT Protocol lexicon. The visibility system (`visibilityStore`, `useVisibilityCoreStore`) is well-designed. The FlashList v2 integration with `useRecyclingState` is correct. The MMKV + Zustand persist setup is correct.

---

## File Index for Quick Navigation

| Issue                       | Primary Files                                                           |
| --------------------------- | ----------------------------------------------------------------------- |
| 1.1 Dynamic imports         | `src/services/api/core.ts`, `src/services/api/feed/feedInteractions.ts` |
| 1.2 SeenVideo O(n)          | `src/services/SeenVideoService.ts`                                      |
| 1.3 VideoItem memo          | `src/components/features/feed/VideoItem.tsx`                            |
| 1.4 Zustand subscriptions   | `src/hooks/useFeed.ts`, `src/components/features/video/VideoCard.tsx`   |
| 2.1 AtprotoService facade   | `src/services/api/AtprotoService.tsx` + all callers                     |
| 2.2 Unread count cache      | `src/hooks/useUnreadCount.ts`, `src/utils/query/queryKeys.ts`           |
| 2.3 useEffect derived state | `src/components/features/video/VideoCard.tsx`                           |
| 2.4 FeedRenderer options    | `src/components/features/feed/FeedRenderer.tsx`                         |
| 3.1 VisionCamera v5         | `package.json`, `app/create.tsx`                                        |
| 3.2 expo-video preload      | `src/utils/video/helpers.ts`, feed list component                       |
| 3.3 FFprobe removal         | `src/services/video/VideoProcessingService.ts`                          |
| 3.4 refetchOnReconnect      | `src/utils/query/queryClient.ts`                                        |
| 4.1 sendVideoFeedback       | `src/services/api/feed/feedInteractions.ts`                             |
| 4.2 JSON.parse safety       | `src/services/api/AtprotoService.tsx`                                   |
| 4.3 prefetchColorsForUser   | `src/stores/userStore.ts`                                               |
