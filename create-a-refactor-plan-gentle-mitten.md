# Chat Refactor Plan

## Context

The chat feature works, but has grown past what its structure can carry:

- `app/chat/[id].tsx` is ~2,850 LOC — one component owns rich-text parsing, embed detection, reactions, message grouping, read-state debouncing, and navigation to full-height video. It is hard to change without regressions.
- `ChatService` mixes lexicon wrapping, 429 backoff, and RichText facet detection in one file; cache side-effects live across `useChatLogPolling`, `ChatsTab`, and `[id].tsx`.
- `useChatLogPolling` only updates the currently open conversation. New messages in other convos rely on a 30s `refetchInterval` in `ChatsTab`, which feels sluggish. Backoff is message-driven rather than error/visibility-driven.
- Video embeds in chat work via `seedChatEmbedVideoFeed`, but the tap handler that invokes it is duplicated inline in `[id].tsx` and (per the share sheet) elsewhere. The experience is not visually distinctive — it's a record card.
- `ChatsTab` re-reads raw React Query cache to compute streaks and prefetches messages for 5 convos purely to light streak badges; meanwhile `STREAKS_ENABLED = false`. Dead complexity.
- `sendMessageBatch`, `updateAllRead`, and `getConvoAvailability` are wired but unused; offline/reconnect handling for message sends is absent; there is no global rate-limit gate shared across `getLog`, `listConvos`, and `getMessages`.

The goal: rebuild chat around a small, reducer-driven cache layer, split the mega-screen into composable UI, ship a first-class video embed experience, and cut total chat LOC meaningfully.

## Target Architecture

New feature folder (replaces scattered `src/services/api/chat`, `src/hooks/useChatLog*`, `src/utils/chat`, and most of `src/components/features/activity/ChatsTab.tsx` + `app/chat/[id].tsx`):

```
src/features/chat/
  api/
    chatClient.ts        # proxy header, 429 gate, typed error mapping
    ChatService.ts       # pure lexicon wrapper (no retry, no RichText)
    facets.ts            # RichText facet detection, extracted
    types.ts             # narrowed Convo/Message + embed discriminants
  cache/
    keys.ts              # re-exports from queryKeys.chat (single source)
    mergeLog.ts          # pure reducer: GetLog events -> cache patches
    selectors.ts         # getLastPreview, getOtherMember, isMessageFromMe
    optimistic.ts        # sendMessage, addReaction, updateRead helpers
  hooks/
    useConvosQuery.ts
    useMessagesQuery.ts
    useChatLog.ts        # global polling (all convos), adaptive cadence
    useSendMessage.ts    # optimistic + offline queue
    useReaction.ts
    useReadReceipt.ts    # debounced, coalesced
    useConvoActions.ts   # accept/decline/leave/mute
  ui/
    ConversationRow/     # Row + Preview + Meta + RequestActions
    MessageList/         # FlashList + grouping + date headers
    MessageBubble/       # frame + text + reactions + delivery state
    embeds/
      MessageEmbed.tsx   # switch: record | video | image | external
      VideoEmbedCard.tsx # poster + play + duration pill
    Composer/            # reuses CommentInputFooter TextInput base
    empty/ loading/ error/
  screens/
    ChatListScreen.tsx   # used by ChatsTab slot + /chat/requests
    ChatThreadScreen.tsx # used by app/chat/[id].tsx
  utils/
    preview.ts           # getLastMessagePreview (extracted)
    grouping.ts          # message grouping + date separators
    streak.ts            # kept, but read from cached messages only
    seedChatEmbedVideoFeed.ts # unchanged location is fine; callers consolidated
```

`app/chat/[id].tsx` and `app/chat/requests.tsx` become thin route shells that render the feature screens. `src/components/features/activity/ChatsTab.tsx` is reduced to a `<ChatListScreen mode="activity" />` wrapper so the Activity tab keeps working.

## Core Design Decisions

### 1. `mergeLog` reducer owns cache writes

All `chat.bsky.convo.getLog` events flow through one pure function:

```ts
mergeLog(state, event): state   // returns cache patches for:
  - queryKeys.chat.messages.byConversation(convoId)
  - queryKeys.chat.conversations.list(...)   // bump lastMessage + unread
  - queryKeys.unread.summary()
```

Handles: `logCreateMessage`, `logDeleteMessage`, `logAddReaction`, `logRemoveReaction`, plus today-ignored events (`logAcceptConvo`, `logLeaveConvo`, `logMuteConvo`, `logUnmuteConvo`, `logReadMessage`) when present. Unit testable in isolation. Replaces ad-hoc `setQueryData` in `useChatLogPolling` at [src/hooks/useChatLogPolling.ts:52-118](src/hooks/useChatLogPolling.ts#L52-L118) and the implicit invalidations in `ChatsTab`.

### 2. `useChatLog` is global, not per-thread

Single app-level polling hook (mount in the tab layout, not per screen). Adaptive cadence:

- foreground + thread open: 2s
- foreground + list open: 5s
- foreground idle: 15s
- backgrounded: stop
- AppState `active` or network reconnect: flush immediately (reuse existing [src/utils/query/lifecycle.ts](src/utils/query/lifecycle.ts))
- on 429: honor `Retry-After` via shared gate in `chatClient.ts`; double interval, jitter
- persist cursor to MMKV so cold start diffs rather than refetches

This removes the 30s `refetchInterval` on `listConvos` and the per-thread `useChatLogPolling`. List updates become near-instant.

### 3. `chatClient` centralizes retry, 429, and error mapping

Pull `withRetry429`, `parseRetryAfterMs`, and header logic out of [src/services/api/chat/ChatService.ts:25-48](src/services/api/chat/ChatService.ts#L25-L48). Expose a shared `rateLimitGate: Promise<void>` that all chat calls (including polling) await. `ChatService` methods become trivial lexicon wrappers. Facet detection moves to `facets.ts` and is called explicitly by `useSendMessage`, not implicitly by `ChatService.sendMessage`.

### 4. Screen split (the headline LOC cut)

`app/chat/[id].tsx` (~2850 LOC) splits into:

- `ChatThreadScreen.tsx` — hooks, layout, keyboard
- `MessageList.tsx` — FlashList + `getItemType` (text/embed/image/video) + grouping via `utils/grouping.ts`
- `MessageBubble.tsx` — frame, memoized
- `MessageText.tsx` — rich-text renderer (extract `formatChatRichTextParts`)
- `MessageReactions.tsx` + `ReactionPicker.tsx`
- `embeds/MessageEmbed.tsx` — single switch; `VideoEmbedCard` / `ImageEmbedCard` / `RecordEmbedCard` / `ExternalEmbedCard`
- `Composer.tsx` — reuses TextInput primitives from [src/components/features/comments/CommentInputFooter.tsx](src/components/features/comments/CommentInputFooter.tsx)
- `MessageDeliveryState.tsx` — pending / sent / read indicator

Target: `ChatThreadScreen` under 250 LOC; each sub-component under 200 LOC.

### 5. Video embed, first-class

`VideoEmbedCard` uses a real thumbnail (poster from the video view), a play-button overlay, aspect-ratio box, and a subtle teal corner pill showing duration. Tapping calls `seedChatEmbedVideoFeed` (already in place) and pushes the tab-stack full-height-video route — single code path, invoked from [src/utils/chat/seedChatEmbedVideoFeed.ts](src/utils/chat/seedChatEmbedVideoFeed.ts). Consolidate all call sites to a `useOpenChatVideoEmbed()` hook so the sharesheet/notifications/chat paths agree.

Visual polish: spring-in transition using existing Reanimated patterns, match aspect ratio to video, show author chip on long-press (reuses `AuthorItem`). No new design tokens — uses `Colors.neutral[925]`, `BORDER_RADIUS.MEDIUM`, `brand.teal`, `Typography.caption`.

### 6. Optimistic send + offline queue

`useSendMessage` writes a `pending` placeholder into the messages cache (temp id, `rev: 'pending'`). On success, reconcile by `rev`; on failure, mark `failed` and expose retry on tap. If offline (detect via existing offline handling from commit `66f33e7e`), queue to a Zustand+MMKV store and flush on reconnect in original order. Reactions and `updateRead` are optimistic-only (no queue — they're idempotent).

### 7. Debounced, coalesced read receipts

`useReadReceipt(convoId)` accepts the most-recent visible message id from scroll; coalesces calls with a 500ms trailing debounce and ignores duplicates. Replaces the manual `useRef`+`setTimeout` in `[id].tsx`.

### 8. Dead-code cut

- Delete streak prefetch in [ChatsTab.tsx:477-509](src/components/features/activity/ChatsTab.tsx#L477-L509). Either re-enable `STREAKS_ENABLED` reading from already-cached messages, or delete the streak code outright. **Recommendation: delete now, re-add when wanted.** Removes ~50 LOC and a useQueries dependency.
- Remove `sendMessageBatch` and `getConvoAvailability` from `ChatService` (not called); keep `updateAllRead` and surface it behind a "Mark all as read" action in `ChatSettingsSheet`.
- Delete [src/utils/chat/streak.ts](src/utils/chat/streak.ts) if going with the delete option.

## File-Level Change Map

**New files** (feature folder above).

**Rewritten**

- [app/chat/[id].tsx](app/chat/[id].tsx) — thin shell over `ChatThreadScreen`
- [app/chat/requests.tsx](app/chat/requests.tsx) — thin shell over `ChatListScreen` with `status: 'request'`
- [src/components/features/activity/ChatsTab.tsx](src/components/features/activity/ChatsTab.tsx) — reduced to `<ChatListScreen/>` wrapper; keeps segmented chips + settings gear slot
- [src/services/api/chat/ChatService.ts](src/services/api/chat/ChatService.ts) — lexicon-only

**New but minimal**

- [src/features/chat/api/chatClient.ts](src/features/chat/api/chatClient.ts)
- [src/features/chat/cache/mergeLog.ts](src/features/chat/cache/mergeLog.ts)
- [src/features/chat/hooks/useChatLog.ts](src/features/chat/hooks/useChatLog.ts)

**Deleted**

- [src/hooks/useChatLogPolling.ts](src/hooks/useChatLogPolling.ts) — replaced by `useChatLog`
- [src/utils/chat/streak.ts](src/utils/chat/streak.ts) — if dropping streaks

**Untouched but reused**

- [src/utils/query/queryKeys.ts](src/utils/query/queryKeys.ts) (chat section already good)
- [src/utils/query/chatQueryOptions.ts](src/utils/query/chatQueryOptions.ts)
- [src/utils/query/lifecycle.ts](src/utils/query/lifecycle.ts) — focusManager bridge
- [src/components/ui/NativePressable.tsx](src/components/ui/NativePressable.tsx), `Avatar`, `Icon`, `OptionsButton`, `ListHeader`, `EmptyFeed`, `ActivitySegmentedChips`, `itemSizeConfig`
- [src/components/features/comments/CommentInputFooter.tsx](src/components/features/comments/CommentInputFooter.tsx) — TextInput primitives for Composer
- [src/services/FeedService.ts](src/services/FeedService.ts) — `setCurrentFeed` for video embed taps
- `Colors`, `Typography`, `BORDER_RADIUS`, `QUERY_CONSTANTS`

## Execution Order (incremental, each step shippable)

1. **Extract `chatClient` + `facets`** — no behavior change. Move retry, proxy headers, RichText out of `ChatService`. Unit test `chatClient`.
2. **Introduce `mergeLog` reducer** — migrate `useChatLogPolling` to call it. Still per-thread. Unit-test with fixture events.
3. **Split `ChatsTab` row** into `ConversationRow/*`; move `getLastMessagePreview` → `utils/preview.ts`. Delete streak prefetch. Visible LOC drop.
4. **Split `app/chat/[id].tsx`** into `ChatThreadScreen` + `MessageList` + `MessageBubble` + `MessageText` + `MessageReactions` + `embeds/*` + `Composer`. Keep behavior parity.
5. **Replace `useChatLogPolling` with global `useChatLog`**; mount in tabs layout. Remove `refetchInterval` from `ChatsTab`. Adaptive cadence + AppState/network gating + MMKV cursor.
6. **Optimistic `useSendMessage` + offline queue.** Failed-message retry UI in `MessageBubble`.
7. **Coalesced `useReadReceipt`.** Replace inline debounce in thread.
8. **`VideoEmbedCard` redesign** + `useOpenChatVideoEmbed` consolidation.
9. **Cleanup**: delete unused `ChatService` methods, delete `useChatLogPolling`, delete streak code, delete dead parsing paths in `[id].tsx` shell.

Each step ships on its own; 1–3 are pure refactors, 4 is mechanical, 5–8 are behavioral wins.

## Verification

After each step:

- `yarn typecheck` passes.
- Unit tests for `mergeLog` (new) cover every log event type + unknown type passthrough.
- Run app: `yarn start` + `yarn ios` (per project memory: Expo SDK 55, Metro :8081).
- Use argent MCP to exercise the golden paths on the simulator:
  - Open a chat, send a text message, verify it appears optimistically.
  - Send a message from another account (or replay via `argent-create-flow`), verify it appears within ~2s without opening that thread.
  - Open a video-embed message, confirm `VideoEmbedCard` poster + tap opens full-height video, moderation-filtered posts are hidden.
  - Scroll to bottom, verify a single `updateRead` fires after debounce (inspect via `native-network-logs`).
  - Airplane-mode, send two messages, disable airplane-mode, confirm both send in order.
  - Accept and decline a chat request from `/chat/requests`; verify the list updates.
  - Background the app 60s, return; confirm no duplicate messages, cursor resumed.
- Compare before/after LOC with `wc -l` on `app/chat/[id].tsx`, `ChatsTab.tsx`, `ChatService.ts`, and the new `features/chat/` tree. Target: net reduction of ~1500 LOC overall.

## Out of Scope

- Push notifications for chat (separate project).
- End-to-end encryption (not in lexicon).
- Typing indicators (not in lexicon).
- Reviving streaks — kept as a clearly-marked follow-up.
