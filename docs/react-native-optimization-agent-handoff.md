# React Native optimization — agent handoff plan

**Purpose:** Handoff from `/argent-react-native-optimization` work. Another agent should use this as the single source of truth for **what was done**, **what the profiler showed**, and **what to do next**.

**Related doc:** [`docs/feed-scroll-performance.md`](./feed-scroll-performance.md) — existing feed/video list notes and QA checklist.

---

## Stack and constraints

| Item   | Detail                                                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| App    | Orbyt (`orbyt`), Expo ~55, React Native New Architecture (bridgeless)                                                                 |
| React  | 19.x; **React Compiler** enabled (`babel-plugin-react-compiler` in `babel.config.js`)                                                 |
| Lists  | `@shopify/flash-list`                                                                                                                 |
| Motion | `react-native-reanimated` preferred over legacy `Animated`                                                                            |
| Policy | Prefer **measurement before** large refactors. Avoid blanket `useMemo`/`useCallback`/`React.memo` unless compiler bail-out is proven. |

---

## Completed work (four-phase pipeline)

### Phase 1 — Lint sweep

- **Result:** `yarn lint` — **0 errors**; remaining warnings are largely intentional (e.g. RN globals, hooks rules where compiler or patterns apply).
- Baseline lint report was generated as `.lint-report.json` during the session (may be regenerated with `yarn lint --format json` or project-equivalent).

### Phase 2 — Semantic / correctness fixes (shipped in working tree)

High-confidence fixes (async, timers, effect deps, races):

| Area                                | File                                                    | Change                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Notification repost fetch waterfall | `src/components/features/activity/NotificationsTab.tsx` | Parallelize direct posts + repost resolution; parallelize per-repost `getRecord` calls; single `Promise.all` for posts vs repost branch. |
| Nested timers                       | `src/components/features/comments/CommentItem.tsx`      | Cleanup for outer + inner `setTimeout` when highlight effect tears down.                                                                 |
| Deferred `setTimeout(0)`            | `src/components/ui/usersearch.tsx`                      | `clearTimeout` in effect cleanups for mention/search deferrals.                                                                          |
| Description selection reset         | `app/post/VideoPostScreen.tsx`                          | `clearTimeout` when modal closes / effect re-runs.                                                                                       |
| Async race                          | `src/hooks/useRichText.ts`                              | `cancelled` flag so stale facet resolution does not call `setRichText` after unmount or `text` change.                                   |
| Effect deps + async                 | `app/settings/blocked.tsx`, `app/settings/muted.tsx`    | `load*` in `useCallback`; `useEffect` with `cancelled` boolean (avoid `AbortSignal` ESLint `no-undef` without widening globals).         |
| Dead style                          | `app/(modals)/notification-filter.tsx`                  | Removed unused `sectionSubtitle` style.                                                                                                  |

### Phase 3 — Baseline profile (React profiler only)

**User decision:** Skip **iOS / `xctrace` profiler** for this pass; use **argent React profiler** only (`user-argent` MCP: `react-profiler-start` → interactions → `react-profiler-stop` → `react-profiler-analyze`).

**Scenario recorded:** ~**41.6s** session, **86** React commits, **5** vertical feed swipes on the home video feed (simulator UDID was in use during the session; re-run with current UDID from `list-simulators`).

**Summary metrics (from `react-profiler-analyze`):**

| Metric                                      | Value                                                    |
| ------------------------------------------- | -------------------------------------------------------- |
| Samples                                     | ~3426                                                    |
| Fiber renders captured                      | Very large (session-scale); analysis subsampled          |
| **Hot commits** (≥ **16ms** absolute floor) | **7 / 86**                                               |
| Slowest hot commit                          | **Commit #81 ~54ms** — **~10,221 fibers** in that commit |
| React Compiler                              | Detected active (`any_compiler_optimized: true`)         |

**Hot commit indices (for replay / drill-down):** `4, 11, 26, 43, 62, 64, 81` (cross-check with latest `react-profiler-analyze` output after any re-run).

**Top aggregate-cost components (report table — dev build; divide ~3× for rough production feel):**

| Component                                    | Notes                                                                                          |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `ContextNavigator`                           | Root navigation; appears on every large commit — **navigation context** driving wide cascades. |
| `View`                                       | Massive count — **symptom** of root/context invalidation, not the fix target itself.           |
| `VideoCard`                                  | Compiler-marked optimized in places; still non-trivial cost when parents invalidate.           |
| `VideoAmbientBackdrop`                       | **~148 instances per heavy commit**, not ~15. Explained below.                                 |
| `VideoScrubberActive`                        | High **per-commit** cost when scrubber state/props churn during scroll.                        |
| `SvgXml`, `Canvas`, `ExpoImage`, `Pressable` | Downstream of the same cascades.                                                               |

**Drill-down insight (commit #81, `profiler-commit-query` / grep on export):**

- Routes present in the same commit subtree include **`Route(home)`**, **`Route(activity)`**, **`Route(explore)`**, **`Route(profile)`**, **`Route(index)`** — i.e. **multiple tabs’ route trees participate** in the same React pass.
- Rough component counts in that commit (order-of-magnitude from exported analysis): **`VideoAmbientBackdrop` ~148**, **`VideoCard` ~30**, **`NotificationItem` ~40**, multiple **`GridFeedView`** instances — consistent with **mounted tab stacks + grids + feed**, not “15 visible cards only.”

**Root cause hypothesis (validated enough to implement next):**

1. **`NativeTabs` (Expo Router `expo-router/unstable-native-tabs`)** keeps **visited tabs mounted** (UIKit-style). Once the user has opened home, explore, activity, and profile, **all subtrees stay live**.
2. Something in the **navigation / router state** (or a subscriber) **updates on feed scroll** (or on a high-frequency cadence correlated with scroll), causing **`ContextNavigator`** and everything under **`NavigationProvider`** to **re-render**.
3. That invalidates **every mounted tab**, including:
   - **~15** `VideoCard` rows for the vertical feed,
   - **~20** `NotificationItem` rows (activity),
   - **~100+** grid cells on profile (each **`VideoGridItem`** in `GridFeedView.tsx` mounts a **`VideoAmbientBackdrop`** per cell — see `src/components/features/feed/GridFeedView.tsx` ~L92),
   - plus explore carousels, etc.
4. Hence **~148 `VideoAmbientBackdrop`** per heavy commit: **not a FlashList virtualization bug alone** — it is **cross-tab retained UI + root navigation context churn**.

**Hermes CPU profile (same session, `profiler-cpu-query` `top_functions`):**

- Dominated by **`[root]`** / React commit work.
- Notable **`[GC Young Gen]`** and **`objectKeys` / array push-pop** — consistent with **allocation churn** from wide re-renders and large trees.

### Phase 4 — Regression sanity

- Simulator **feed scroll** and **tab usage** during profiling showed **no red screen** and **no new Metro fatals** attributable to Phase 2 edits.
- **`yarn type-check`** was known to report **pre-existing** errors in `BotBadge.tsx` / `VerificationBadge.tsx` (StyleProp vs `ViewStyle`) — **not introduced** by this optimization pass; fix separately if CI blocks.

---

## Phase 5 — P0 implementation (shipped in working tree)

**Change:** Gate `VideoAmbientBackdrop` rendering on tab focus (`useIsFocused()` from `@react-navigation/core`) in every cross-tab consumer. Skia `<Canvas>` is the most expensive part of each backdrop; skipping it on retained-but-unfocused tabs is invisible to the user (the tab is off-screen) and shrinks the cross-tab cascade triggered by `ContextNavigator`/`NavigationProvider` updates.

**Files touched:**

| File                                                           | Change                                                                                                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/components/features/feed/GridFeedView.tsx`                | Added `isTabFocused` prop on `VideoGridItem`; threaded `useIsFocused()` from parent; wrap `<VideoAmbientBackdrop>` in `isTabFocused && …`. |
| `src/components/features/activity/NotificationsTab.tsx`        | Same pattern on `NotificationItem`.                                                                                                        |
| `src/components/features/explore/ExploreSpotlightCarousel.tsx` | Same pattern on `SpotlightVideoCell`.                                                                                                      |

**Import note:** `useIsFocused` is re-exported by `@react-navigation/native` via `export * from '@react-navigation/core'`, but during rapid HMR a partial module state can transiently break the re-export. Importing directly from `@react-navigation/core` is more robust under fast-refresh.

**Re-profile result (same 5-swipe scenario, 32.5s session, 89 commits):**

| Metric                                          | Baseline                                                                                | After P0 (3 sites)                                 | Δ          |
| ----------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------- |
| Slowest non-mount commit                        | **~54ms** (#81)                                                                         | **39.65ms** (#52)                                  | **−27%**   |
| 2nd slowest                                     | ~52ms                                                                                   | 38.26ms (#54)                                      | −26%       |
| Hot commits (≥16ms)                             | 7 / 86                                                                                  | 8 / 89                                             | flat       |
| `VideoAmbientBackdrop` instances per cascade    | **~148** (cross-tab)                                                                    | **51** (home only)                                 | **−66%**   |
| `VideoAmbientBackdrop` parent in _every_ commit | mixed: `VideoCardMediaLayer`, `VideoGridItem`, `NotificationItem`, `SpotlightVideoCell` | **only `VideoCardMediaLayer`** (focused home feed) | ✓ goal met |

**Validation (`profiler-commit-query mode=by_component`):** All 918 `VideoAmbientBackdrop` occurrences across the session originate from `VideoCardMediaLayer` (the home feed VideoCard). Zero from the three gated sites — the gate is doing exactly what it should.

**Lint:** `yarn lint` on the three touched files: **0 errors**, no new warnings introduced.

**Remaining cost shape:**

- The cascade is still wide (~2,290 `View`s per commit) because `ContextNavigator` is still re-rendering the whole tree under it. The P0 fix removed the most expensive _leaf_ (Skia `Canvas`) from inactive tabs, not the cascade itself.
- The 51 backdrops left per cascade are all on the _focused_ home tab and represent FlashList's mount window for `VideoCard` (~50 retained instances). See **next P0** below.

---

## Prioritized next steps (for the next agent)

Implement in **order**; **re-profile the same 5-swipe scenario** after each meaningful change.

### P0.5 — Gate `VideoAmbientBackdrop` inside `VideoCard` by `isVisible`

**Goal:** The home-feed `VideoCard` mounts ~50 retained instances via FlashList; each renders a `VideoAmbientBackdrop` whether or not the row is the currently-visible card. Off-screen backdrops are invisible to the user.

**Tactic:** In `src/components/features/video/VideoCard.tsx` (~L1073), pass `isVisible` (or `isVisible` + 1-row prefetch window) into `VideoCardMediaLayer` and gate `<VideoAmbientBackdrop>` accordingly. Care: `onVideoAmbientBackdropReady` is currently used to gate revealing the video — verify the visibility-gate doesn't regress first-frame UX (may need to render backdrop one row ahead, or fall back to the still poster while the gate is closed).

**Acceptance:** `VideoAmbientBackdrop` instances per cascade drops from 51 → ~1–3 (visible card + neighbors). Slowest hot commit drops below ~25ms.

### P0 — Cut cross-tab work during home scroll _(original — partially shipped above)_

**Goal:** When the user is on **home**, do **not** re-render **inactive tabs’** heavy subtrees on every navigation tick.

**Tactics (pick one or combine):**

1. **`useIsFocused()` gating** (from `@react-navigation/native`) at **tab screen** or **heavy subtree** boundary:
   - Wrap **`VideoAmbientBackdrop`** usage in profile grid / activity list / explore with **`null` or lightweight placeholder** when `!isFocused`.
   - Strongest win: **`GridFeedView` / `VideoGridItem`** — one backdrop per grid cell × many cells × retained profile tab.
2. **Audit navigation subscriptions** in parents of the feed:
   - Find **`useSegments`**, **`usePathname`**, **`useGlobalSearchParams`**, **`useNavigationState`**, custom context that mirrors router state.
   - **Narrow selectors** or **move subscriptions** below `FlashList` so list scroll does not tickle root **`NavigationState`** consumers unnecessarily.
3. **Confirm what updates on scroll** — add temporary logging or React DevTools “why did this render?” on `ContextNavigator` / layout route once, then remove.

**Acceptance:** Hot-commit fiber count drops materially; `VideoAmbientBackdrop` **instances per commit** on home scroll approaches **O(visible feed rows)** (~10–20), not **~100+**.

### P1 — `VideoScrubberActive` / scrubber path

**Goal:** Scrubber progress and visibility should not force **JS-thread React work** every frame or every scroll commit.

**Tactics:**

- Align with existing direction in [`docs/feed-scroll-performance.md`](./feed-scroll-performance.md): prefer **Reanimated `SharedValue` + `useAnimatedStyle`** for scrubber geometry/opacity tied to scroll/player.
- Ensure inactive rows do not subscribe to fast-changing store slices without `useShallow` / splitting stores.

**Acceptance:** `VideoScrubberActive` disappears or shrinks dramatically in **top offenders** on the same profile scenario.

### P2 — Skia / `Canvas` under `VideoAmbientBackdrop`

**Goal:** If backdrop must exist, reduce **per-cell** Skia **`Canvas`** cost on profile grid.

**Tactics:**

- Replace per-thumbnail Skia radial with **cheaper gradient** (e.g. `expo-linear-gradient` only) on **small grid thumbnails**; keep rich backdrop on **full-screen video** only.
- Or **memoize at grid cell** with stable `seedUrl` + avoid parent inline objects (compiler helps but verify).

**Acceptance:** Lower `Canvas` / `SvgXml` aggregate time in `react-profiler-analyze` for grid-heavy sessions.

### P3 — React Compiler bail-outs

**Tooling:** `npx react-compiler-healthcheck` on hotspots flagged “should have optimized” (`ContextNavigator`, raw `View` spam — often children of non-compiled parents).

**Goal:** Ensure no **conditional hooks**, **mutating props**, or **dynamic component types** prevent compilation on the hottest custom components.

---

## How to reproduce profiling (argent MCP)

1. `list-simulators` → copy **UDID**.
2. `react-profiler-start` with `port` (e.g. **8081**) and `device_id`.
3. Run the **fixed script**: e.g. open home feed → **N** vertical swipes (baseline used **5**).
4. `react-profiler-stop` (same `port`, `device_id`).
5. `react-profiler-analyze` with `project_root` = repo root, `platform` = `ios`, `rn_version` from `package.json`.
6. Optional: `profiler-commit-query` `mode=by_index` `commit_index=81` (or latest slowest), `profiler-cpu-query` `mode=top_functions`.

**Annotations:** Pass `annotations: [{ offsetMs, label }]` to `react-profiler-analyze` where `offsetMs = gestureTimestampMs - startedAtEpochMs` from `react-profiler-start` and gesture tools’ `timestampMs`.

---

## Verification commands

```bash
yarn lint
yarn type-check   # expect known unrelated failures until Badge components fixed
```

Targeted tests if touched:

```bash
yarn test:feed-visibility
```

---

## Explicit non-goals (this pass)

- **No iOS Instruments / xctrace** baseline in this handoff (user asked React-only). Re-add for **main-thread** and **Core Animation** correlation once JS/React wins plateau.
- **No broad** `React.memo` / manual memoization sweep — compiler-first; prove bail-out before adding noise.

---

## Files touched in this optimization arc (grep / git for truth)

Phase 2 edits (non-exhaustive if more local edits exist):

- `src/components/features/activity/NotificationsTab.tsx`
- `src/components/features/comments/CommentItem.tsx`
- `src/components/ui/usersearch.tsx`
- `app/post/VideoPostScreen.tsx`
- `src/hooks/useRichText.ts`
- `app/settings/blocked.tsx`
- `app/settings/muted.tsx`
- `app/(modals)/notification-filter.tsx`

Profiler-related **code changes**: none required — measurement only.

---

## Open questions for the next agent

1. **What exact subscription** causes `ContextNavigator` / `NavigationProvider` to commit on **vertical list scroll**? (Suspected: segment/path/store sync in a parent; must be confirmed with a short trace.)
2. Should **profile tab grid** use **`VideoAmbientBackdrop` at all** for tiny cells, or only a static dominant-color swatch from thumbnail metadata?
3. After P0, does **`yarn type-check`** still fail only on the known Badge files? Fix in a **separate** PR if desired.

---

_Generated for handoff: structured baseline + next steps after React-only profiling and semantic fixes._
