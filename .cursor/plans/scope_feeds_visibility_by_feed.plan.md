---
name: ""
overview: ""
todos: []
isProject: false
---

# Scope Feed Visibility by Feed Instance (Minimal, No New Code)

## Holistic view of the structure

### What already exists

- **Visibility store** ([`visibilityStore.ts`](src/core/visibility/visibilityStore.ts)): `activeFeedKey` (string) and `lastViewableIndexByFeed: Record<string, number>`. Both are keyed by a string. The hook `useFeedVisibility({ feedKey, isActive })` writes to them.
- **Data layer**: `queryKeys.feed.byUser(feedOption, userDid)` and `useFeed` already treat **(feedOption, userDid)** as the feed instance when `userDid` is present. Same pair flows as `feedOption` + `userDid` from Profile → FeedRenderer → ListFeedView.
- **ListFeedView** already receives `feedOption` and `userDid` from `FeedRenderer`. It currently passes `feedKey: feedOption` into `useFeedVisibility` and uses `feedOption` in `handleOrientationChange` and when rendering `VideoItem`.
- **VideoItem** uses `feedOption` for: `isActiveFeed = (activeFeedKey === (feedOption ?? ''))` and `isViewable = (lastViewableIndexByFeed[feedOption ?? ''] ?? -1) === index`. It does not receive `userDid`.

### Where the bug comes from

For profile (and likes/reposts), `feedOption` is always `'profile'`, `'reposts'`, or `'likes'` and does not include the user. Two profile screens (different `userDid`) therefore share:

- `lastViewableIndexByFeed['profile']` → same viewable index
- `activeFeedKey === 'profile'` → both consider themselves the active feed

So the 3rd video on one profile also plays on the other.

### What is already unique

- **Following / discover / channel / search / at:// / hashtag:…**

`feedOption` is already unique. No `userDid` in the key.

- **Profile / likes / reposts**

The instance is **(feedOption, userDid)**, same as the data layer. We only need to use that pair for the visibility key. `userDid` already flows into `ListFeedView`.

---

## Fix: reuse (feedOption, userDid) as the visibility key

We do **not** introduce new concepts: we use the same **(feedOption, userDid)** the data layer uses and turn it into a string key where `userDid` is present.

- When `(feedOption, userDid)` defines the instance (profile, likes, reposts and `userDid` is set): use `\`${feedOption}:${userDid}\``.
- Otherwise: use `feedOption` as today.

No new helpers, context, or store. No changes to FeedRenderer, Profile, `useFeedVisibility`, or the visibility store shape.

---

## Changes (2 files only)

### 1. ListFeedView ([`src/components/features/feed/ListFeedView.tsx`](src/components/features/feed/ListFeedView.tsx))

**a) Derive `feedKey` from existing `feedOption` and `userDid`**

Same rule as the data layer: for profile/likes/reposts, include `userDid` when it exists.

```ts
const feedKey = useMemo(
  () =>
    (feedOption === 'profile' || feedOption === 'likes' || feedOption === 'reposts') && userDid
      ? `${feedOption}:${userDid}`
      : feedOption,
  [feedOption, userDid]
);
```

**b) Use `feedKey` instead of `feedOption` in:**

- `useFeedVisibility({ feedKey, isActive: Boolean(isVisible) })`
- `handleOrientationChange`: `lastViewableIndexByFeed[feedKey]`, `activeFeedKey === feedKey`, deps `[feedKey, feed.length]`
- `renderItem`: pass `feedKey={feedKey}` to `VideoItem` and add `feedKey` to the `useCallback` deps.

---

### 2. VideoItem ([`src/components/features/feed/VideoItem.tsx`](src/components/features/feed/VideoItem.tsx))

**a) Optional prop**

- `feedKey?: string`

**b) Resolve key and use in store**

- `const key = (feedKey ?? feedOption) ?? ''`
- `isActiveFeed`: `s.activeFeedKey === key`
- `isViewable`: `(s.lastViewableIndexByFeed[key] ?? -1) === index`

**c) `areEqual`**

- `prevProps.feedKey !== nextProps.feedKey` → return false.

---

## What we do **not** change

- **VideoCard**: `useRecyclingState` and overlay use `feedOption` as today. Different profile feeds are different lists; there is no cross-list recycling. The bug is from the visibility store key, not VideoCard.
- **FeedRenderer**: continues to pass `feedOption` and `userDid`; no new props.
- **Profile, FeedPager, channel, modals**: no changes.
- **`useFeedVisibility`**: signature stays `{ feedKey, isActive }`; we only change the value passed for `feedKey`.
- **Visibility store and `hooks.ts`**: no changes.
- **New helpers, context, or `queryKeys`**: none.

---

## Summary

| File | Change |

|------------|-------------------------------------------------------------------------|

| ListFeedView | `useMemo` for `feedKey`; use `feedKey` in `useFeedVisibility`, `handleOrientationChange`, and `VideoItem`; add `feedKey` to `renderItem` deps. |

| VideoItem | Optional `feedKey`; `key = (feedKey ?? feedOption) ?? ''`; use `key` in both store selectors and in `areEqual`. |

This reuses the existing (feedOption, userDid) that already identifies the feed instance in the data layer and applies it to the visibility store’s string key, without new abstractions or extra files.