---
name: ''
overview: ''
todos: []
isProject: false
---

# Content Moderation: Exact SDK Types, High-Level Batch, Dead Code Removal

## 1. Use Exact Types from `@atproto/api` (No Translation or Abstraction)

Import only from `@atproto/api`. Do not define our own mirrors or adapters.

**Imports to use (from `@atproto/api`):**

- **Moderation:** `moderatePost`, `moderateProfile`, `moderateNotification`, `ModerationUI`, `ModerationDecision`, `ModerationOpts`, `ModerationPrefs`, `ModerationPrefsLabeler`, `LabelPreference`, `InterpretedLabelValueDefinition`
- **Subject types (for `moderate*`):** `ModerationSubjectPost` = `AppBskyFeedDefs.PostView`; `ModerationSubjectNotification`; `ModerationSubjectProfile`
- **Agent:** `agent.getPreferences()` → `BskyPreferences.moderationPrefs: ModerationPrefs`; `agent.getLabelDefinitions(prefs)` → `Record<string, InterpretedLabelValueDefinition[]>`; `agent.withProxy('atproto_labeler', did)` for report-to-labeler

**Exact type usage:**

- `ModerationOpts`: `{ userDid: string | undefined; prefs: ModerationPrefs; labelDefs?: Record<string, InterpretedLabelValueDefinition[]> }`
- `ModerationPrefs`: `{ adultContentEnabled, labels, labelers, mutedWords, hiddenPosts }` — use as-is from `agent.getPreferences().moderationPrefs`
- `ModerationUI`: class with `noOverride`, `filters`, `blurs`, `alerts`, `informs`, getters `filter`, `blur`, `alert`, `inform` — pass instances to UI; cards read `.blur`, `.noOverride`, `.blurs`
- `ModerationSubjectPost` = `AppBskyFeedDefs.PostView` — use `item.post` from `FeedViewPost` / `ExtendedFeedViewPost`

**Do not:**

- Re-define `ModerationDecision`, `ModerationPrefs`, `ModerationOpts`, or `LabelPreference` in our codebase
- Map `ModerationPrefs` into a different shape (e.g. `ModerationSettings`) for the decision path
- Introduce a “view model” or DTO between `moderatePost`/`mod.ui()` and the card

---

## 2. Prefs and Labelers: Use Agent Helpers Only

- **Read:** `agent.getPreferences()` (not `agent.api.app.bsky.actor.getPreferences`). This:
  - Returns `BskyPreferences` with `moderationPrefs: ModerationPrefs`
  - Calls `configureLabelers(prefsArrayToLabelerDids(preferences))` internally, so `atproto-accept-labelers` includes user labelers on subsequent requests
- **Label defs:** `agent.getLabelDefinitions(moderationPrefs)` (or `getLabelDefinitions(await agent.getPreferences())`). Use return as `ModerationOpts.labelDefs`.
- **Cache:** React Query (or equivalent) for `getPreferences` and `getLabelDefinitions`, plus a small sync into a store so **non-React** callers (e.g. `FeedService`) can read `{ moderationPrefs, labelDefs }` when building `ModerationOpts`. No custom “convert preferences to settings” for the **moderation pipeline**; `ModerationPrefs` is the single source.

---

## 3. Moderation Only at a High Level (No Work in Cards)

All `moderatePost` / `moderateNotification` runs in **one place per data source**, when we have the **array** (or single fetched item), and **before** data is passed to lists/cards.

- **Feed (getFeed / fetchFeed):** After the API returns `feed`, in the same function:
  1. `opts = { userDid, prefs: moderationPrefs, labelDefs }` from store/cache
  2. For each `item`:

`mod = moderatePost(item.post, opts)`

`item.contentListUI = mod.ui('contentList')`

`item.contentMediaUI = mod.ui('contentMedia')`

`item.avatarUI = mod.ui('avatar')`

`item.shouldFilter = mod.ui('contentList').filter`

1. Do **not** run `moderatePost` or any moderation hook inside `VideoCard`, `VideoItem`, `EmbeddedPostCard`, or list item render.

- **Explore spotlight, notifications list, etc.:** Same pattern: one batch over the array right after fetch, attach `contentListUI`, `contentMediaUI`, `avatarUI`, `shouldFilter` on each item.
- **EmbeddedPostCard (single post):** Run `moderatePost` in the **query** that fetches the post (e.g. in `queryFn` after `getPost`), then attach the same UI fields to the result. The card only receives already‑computed props.
- **Cards:** Receive `contentListUI?: ModerationUI`, `contentMediaUI?: ModerationUI`, `avatarUI?: ModerationUI` (and `shouldFilter` is used only by the list to remove items, not by the card). The card does **only**:
  - `blur = contentListUI?.blur || contentMediaUI?.blur`
  - `noOverride = contentListUI?.noOverride || contentMediaUI?.noOverride`
  - `reason` from `contentListUI?.blurs[0]` or `contentMediaUI?.blurs[0]` if needed for the banner

No `useModerationSettings`, `moderatePost`, or `computeModerationDecision` inside any card. No extra rerenders from moderation in cards.

---

## 4. Feed Item Type: Extend with SDK Types Only

Extend `ExtendedFeedViewPost` (or equivalent) with fields set by our batch:

```ts
// Use ModerationUI from '@atproto/api'
contentListUI?: ModerationUI
contentMediaUI?: ModerationUI
avatarUI?: ModerationUI
shouldFilter?: boolean  // already present; keep
```

Remove `shouldBlur` as a separate stored field; cards derive it from `contentListUI?.blur || contentMediaUI?.blur`. Optionally keep `shouldBlur` only as a **derived** value at the **feed** layer when building the item (for list/filter logic that still expects a boolean), but the **card** should prefer reading `ModerationUI` when available.

---

## 5. Delete Redundant and Dead Code

**Remove entirely:**

- `src/utils/moderation/computeDecision.ts` — `computeModerationDecision`, `detectContentType`
- `src/services/moderation/ModerationTypes.ts` — our `ModerationDecision`, `ModerationSettings`, `ModerationOpts`, `LabelPreference` (and any re‑exports that duplicate `@atproto/api`)

**In `src/services/moderation/ModerationService.ts`:**

- Remove: `createSafeDefaultSettings`, `convertPreferencesToSettings`, `convertSettingsToPreferences`, `getCachedModerationSettings`, `clearModerationSettings`, `getModerationSettings`, `fetchModerationSettings`, `syncModerationSettings`
- Replace the “fetch” path with: call `agent.getPreferences()`, return `res.moderationPrefs` (and ensure `getLabelDefinitions` is called and cached elsewhere). No conversion into a custom `ModerationSettings`.
- **Save path:** Keep a single function that writes back to the API. It must work with `ModerationPrefs` (or the edited subset). Implementation: `getPreferences` → merge in the updated `adultContentEnabled`, `labels`, `labelers`, `mutedWords`, `hiddenPosts` into the in‑memory prefs → build the corresponding pref records (`adultContentPref`, `contentLabelPref`, `labelersPref`, `mutedWordsPref`, `hiddenPostsPref`) and merge into the full preferences array → `putPreferences`. Do **not** keep a parallel “settings” model; the API-facing shape is `ModerationPrefs` and the raw preferences array.

**In `src/hooks/useModerationSettings.ts`:**

- Rename / refocus to prefs + label defs. Query: `agent.getPreferences()` and `agent.getLabelDefinitions(moderationPrefs)`.
- Return `{ moderationPrefs: ModerationPrefs, labelDefs }` (and loading/error). Optionally push `{ moderationPrefs, labelDefs }` into a small store for `FeedService` and other non‑React code.

**In `src/services/api/moderation/ModerationService.ts` (reportContent):**

- When `labelerDid` is provided: `agent = (await getApiClient()).api` (or equivalent), then

`client = agent.withProxy('atproto_labeler', labelerDid)`

and use `client.api.com.atproto.moderation.createReport` (or the correct `com.atproto` path on the agent). No translation of types; use the same `subject`, `reasonType`, `reason` as today.

**Other clean-up:**

- All imports of `ModerationDecision` or `ModerationSettings` from `./ModerationTypes` or `./moderation/ModerationTypes` → switch to `ModerationUI` / `ModerationPrefs` / `ModerationOpts` from `@atproto/api`.
- `VideoCard`, `VideoItem`, `EmbeddedPostCard`, `ListFeedView`, `NotificationsTab`, `explore` spotlight: drop `computeModerationDecision` and any `useModerationSettings` used only for per‑item moderation. Cards receive `contentListUI` / `contentMediaUI` / `avatarUI` from the parent; parents get those from the feed/item built in the batch.

---

## 6. Where Moderation Runs (Data Flow)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  useModerationPrefs (or useModerationSettings)                          │
│  - agent.getPreferences() → moderationPrefs                              │
│  - agent.getLabelDefinitions(moderationPrefs) → labelDefs                │
│  - cache + optional store for FeedService                                │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  FeedService.getFeed / fetchFeed (or equivalent for notifications,      │
│  explore spotlight, EmbeddedPostCard’s fetch)                           │
│  - opts = { userDid, prefs: moderationPrefs, labelDefs }                  │
│  - for each item: moderatePost(item.post, opts)                          │
│    → item.contentListUI, item.contentMediaUI, item.avatarUI,             │
│      item.shouldFilter                                                   │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  ListFeedView / list logic                                               │
│  - filter out item where item.shouldFilter                               │
│  - pass item (with contentListUI, contentMediaUI, avatarUI) to VideoItem  │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  VideoCard / EmbeddedPostCard                                            │
│  - blur = contentListUI?.blur || contentMediaUI?.blur                    │
│  - noOverride = contentListUI?.noOverride || contentMediaUI?.noOverride  │
│  - reason from .blurs[0] if needed                                       │
│  - no moderatePost, no useModerationSettings, no computeModerationDecision│
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Files to Touch

| File | Changes |

|------|---------|

| `src/utils/moderation/computeDecision.ts` | **Delete** |

| `src/services/moderation/ModerationTypes.ts` | **Delete** |

| `src/services/moderation/ModerationService.ts` | Remove fetch/convert/cache/sync; add getModerationPrefs via `agent.getPreferences().moderationPrefs`; keep one save path that merges `ModerationPrefs` into prefs array and `putPreferences` |

| `src/hooks/useModerationSettings.ts` | Use `agent.getPreferences()` and `agent.getLabelDefinitions`; return `{ moderationPrefs, labelDefs }`; optionally sync to store |

| `src/services/api/feed/FeedService.ts` (and any wrapper `FeedService`) | After building `feed`, run moderation batch: get `ModerationOpts` from store/cache, `moderatePost(item.post, opts)`, set `contentListUI`, `contentMediaUI`, `avatarUI`, `shouldFilter` on each item |

| `src/services/api/types.ts` | Extend `ExtendedFeedViewPost` with `contentListUI?`, `contentMediaUI?`, `avatarUI?` (`ModerationUI` from `@atproto/api`); can remove `shouldBlur` if fully replaced by `contentListUI`/`contentMediaUI` |

| `src/components/features/feed/ListFeedView.tsx` | Keep filtering by `shouldFilter`; pass `feedItem.contentListUI`, `contentMediaUI`, `avatarUI` into `VideoItem` (or pass `feedItem` and let `VideoItem`/`VideoCard` read those) |

| `src/components/features/feed/VideoItem.tsx` | Accept `contentListUI`, `contentMediaUI`, `avatarUI` (or `feedItem`); pass through to `VideoCard`; remove any local `computeModerationDecision` or `useModerationSettings` for moderation |

| `src/components/features/video/VideoCard.tsx` | Props: `contentListUI?`, `contentMediaUI?`, `avatarUI?` (or read from `feedItem`). Compute `blur`, `noOverride`, `reason` from these; remove `ModerationDecision` and `computeModerationDecision` |

| `src/components/features/chat/EmbeddedPostCard.tsx` | Moderation in the **post fetch** (queryFn); receive `contentListUI`, `contentMediaUI`, `avatarUI` from query; same card logic as VideoCard; remove `computeModerationDecision` and per‑card `useModerationSettings` for moderation |

| `src/components/features/activity/NotificationsTab.tsx` | Run `moderateNotification` (or `moderatePost` on the embedded post) in the **data layer** that produces the list; attach UI to each item; card only reads `ModerationUI`; remove `computeModerationDecision` and `ModerationSettings` |

| `app/(tabs)/explore.tsx` | Spotlight: run moderation batch when building the spotlight array; set `contentListUI`, `contentMediaUI`, `avatarUI`, `shouldFilter`; remove `computeModerationDecision` |

| `src/services/api/moderation/ModerationService.ts` | In `reportContent`, when `labelerDid` is provided, use `agent.withProxy('atproto_labeler', labelerDid)` and call `createReport` on that client |

| `src/types/index.ts` | Remove `ModerationDecision` import from `ModerationTypes`; use `ModerationUI` from `@atproto/api` where needed |

| `src/components/features/moderation/ModerationControls.tsx` | Use `ModerationPrefs` (or `moderationPrefs` from `useModerationSettings`) if it only reads; no `ModerationSettings` |

| `app/settings/content-filters.tsx` | Use `ModerationPrefs` and `LabelPreference` from `@atproto/api`; drive save via the new `ModerationService` save that takes `ModerationPrefs` |

| `app/settings/hidden-posts.tsx` | Use `moderationPrefs.hiddenPosts` (from `ModerationPrefs`) |

| `src/services/index.ts` | Remove `ModerationTypes` re-exports; keep `ModerationService` export if it still provides get/save/report |

---

## 8. Store for ModerationOpts (Optional but Recommended)

`FeedService` and other non‑React code need `{ moderationPrefs, labelDefs, userDid }` to build `ModerationOpts`. Add a small store (e.g. Zustand):

- `setModeration(opts: { moderationPrefs: ModerationPrefs; labelDefs: Record<string, InterpretedLabelValueDefinition[]> })`
- `getModerationOpts(): ModerationOpts | null` (merge with `userDid` from `useUserStore` or session)

`useModerationSettings` (or the prefs hook) writes to this store when it fetches. `FeedService` reads from it at the start of the feed build. If `getModerationOpts()` is null, the batch can be skipped and items will have no `contentListUI`/`contentMediaUI`/`avatarUI`; cards treat missing as “no blur”.

---

## 9. Summary

- **Types:** Only `@atproto/api` types: `ModerationPrefs`, `ModerationOpts`, `ModerationUI`, `moderatePost`, `moderateProfile`, `moderateNotification`, etc. No translation, no `ModerationSettings`/`ModerationDecision` in our codebase.
- **Prefs and labelers:** `agent.getPreferences()` and `agent.getLabelDefinitions`; `ModerationPrefs` is the only shape for the moderation path.
- **Moderation placement:** One batch per feed/notification/spotlight/fetched‑post, in the data layer. Cards only read `ModerationUI` and derive `blur` / `noOverride` / `reason`; no `moderatePost`, no `useModerationSettings`, no `computeModerationDecision` in any card.
- **Dead code:** Remove `computeDecision.ts`, `ModerationTypes.ts`, and all convert/cache/sync/fetch logic that duplicates or abstracts `getPreferences`/`ModerationPrefs`/`moderatePost`/`ModerationUI`.
- **Reports:** Use `agent.withProxy('atproto_labeler', labelerDid)` when `labelerDid` is provided, with the same `createReport` payload.
