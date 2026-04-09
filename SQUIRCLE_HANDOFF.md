# react-native-resquircle Implementation Handoff

## Overview

This document captures the full state of the squircle refactor for handoff to a continuation agent.

The goal is to replace all standard rounded corners (`borderRadius` circular arcs) with iOS-style
superellipse curves using `react-native-resquircle`. This is a **component-swap operation** — the
`borderRadius` values and `StyleSheet.create()` entries do NOT change. Only the rendered component
type changes: `View` → `SquircleView`, `NativePressable`/`Pressable` → `SquircleButton`.

---

## Environment

- **Expo SDK:** 55, **RN:** 0.83.4, **New Architecture / Fabric:** yes
- **Workflow:** Bare (ios/ and android/ dirs present, EAS builds)
- **iOS target:** 17.0+, **Android minSdk:** 24
- **Styling:** `StyleSheet.create()` only — no NativeWind/Tailwind
- **Alias:** `@/` → `src/`
- **Import path for wrappers:** `@/components/ui/Squircle` or relative `./Squircle`

---

## Key Design Decisions

### 1. Component Swap — NOT a style change

`SquircleView` and `SquircleButton` accept the same style props (including `borderRadius`,
`backgroundColor`, `borderWidth`, `shadowColor`, etc.) as `View` and `Pressable`. So no
StyleSheet entries need changing — only the JSX element tag.

### 2. `androidRippleBorderless` is NOT supported

`NativePressable` in this codebase accepts a custom `androidRippleBorderless` prop. `SquircleButton`
extends `PressableProps` and does NOT include this prop. When swapping a `NativePressable` that has
`androidRippleBorderless`, **remove that prop** — it has no equivalent on SquircleButton.

### 3. Skip `Animated.View` elements

Do not swap `Animated.View` components even if they have `borderRadius`. The Reanimated worklet
renderer is not compatible with the native squircle Fabric component.

### 4. Skip `Avatar`, `Image`, `GlassView`

- `Avatar` uses a dynamically computed `size * 0.5` circle — squircle has no visible effect.
- `<Image>` tags cannot be swapped; only wrap in `SquircleView` if a parent container View exists.
- `GlassView` from `expo-glass-effect` manages its own rendering; leave its `borderRadius` unchanged.

### 5. `cornerSmoothing` is centralised

All swaps use the wrappers in `Squircle.tsx` which bake in `CORNER_SMOOTHING = 0.6` as the default.
**Never import directly from `react-native-resquircle`** — always use `@/components/ui/Squircle`.

---

## What Is Already Complete

These files have been updated and type-check clean:

| File                                                          | What Was Done                                                                                                          |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `package.json` / `yarn.lock`                                  | `react-native-resquircle@1.0.1` installed + `pod install` run                                                          |
| `src/utils/constants.ts`                                      | Added `export const CORNER_SMOOTHING = 0.6 as const;` after `BORDER_RADIUS` block                                      |
| `src/components/ui/Squircle.tsx`                              | **Created** — thin wrappers for `SquircleView` and `SquircleButton` with `CORNER_SMOOTHING` default                    |
| `src/components/ui/index.ts`                                  | Added `export { SquircleView, SquircleButton } from './Squircle';`                                                     |
| `src/components/ui/UI.tsx`                                    | Swapped: `Card` → SquircleView, `Button`/`RetryButton`/`GoBackButton` → SquircleButton, `Badge` → SquircleView         |
| `src/components/ui/CloseButton.tsx`                           | NativePressable → SquircleButton; removed `NativePressable` import; removed `androidRippleBorderless`                  |
| `src/components/ui/CancelButton.tsx`                          | NativePressable → SquircleButton; removed `NativePressable` import                                                     |
| `src/components/ui/OptionsButton.tsx`                         | Inner `menuOption` View → SquircleView                                                                                 |
| `src/components/ui/PopUpModal.tsx`                            | `modalContainer` View → SquircleView; `actionButton` Pressables → SquircleButton                                       |
| `src/components/ui/LoginSheet.tsx`                            | `inputContainer` View → SquircleView; submit NativePressable → SquircleButton; removed `NativePressable` import        |
| `src/components/ui/SignUpSheet.tsx`                           | Same as LoginSheet                                                                                                     |
| `src/components/ui/AuthorItem.tsx`                            | Root NativePressable → SquircleButton; follow icon NativePressable → SquircleButton; removed `androidRippleBorderless` |
| `src/components/ui/ChannelItem.tsx`                           | Root NativePressable → SquircleButton; removed `NativePressable` import                                                |
| `src/components/features/activity/ActivitySegmentedChips.tsx` | Track View → SquircleView; chip NativePressable → SquircleButton; removed `NativePressable` import                     |
| `src/components/layout/header/UniversalHeader.tsx`            | Fixed all 12 hardcoded `borderRadius: 100` → `BORDER_RADIUS.FULL` (no ActionButton pressable swaps yet)                |

**Type-check status:** `npx tsc --noEmit` passes with zero squircle-related errors. One pre-existing
unrelated error exists in `app/settings/SettingsScreen.tsx` (MenuViewRef type mismatch) — leave it.

---

## What Remains To Do

These files have NOT been touched yet. Each follows the exact same pattern:

1. Add `import { SquircleView, SquircleButton } from '@/components/ui/Squircle';`
2. Swap the JSX element tag
3. Remove any `androidRippleBorderless` props
4. Remove unused `NativePressable`/`View`/`Pressable` imports if no longer used

---

### File: `src/components/features/comments/CommentItem.tsx`

Search for Views using these style keys and swap to `SquircleView`:

- `styles.commentImageWrapper` — `borderRadius: BORDER_RADIUS.MEDIUM`
- `styles.linkPreviewContainer` — `borderRadius: BORDER_RADIUS.MEDIUM`, has `borderWidth: 1`

Do NOT swap `<Image>` elements that have borderRadius — those are not Views.

---

### Files: `src/components/features/explore/` (ExploreScreen component)

Find the component file(s) that render JSX using `ExploreScreenStyles.ts` style keys:

- `searchContainer` — `borderRadius: BORDER_RADIUS.SMALL` → `SquircleView`
- `gridChannelThumbnail` — `borderRadius: BORDER_RADIUS.SMALL` → `SquircleView`
- `spotlightVideoThumbnailContainer` — `borderRadius: BORDER_RADIUS.SMALL` → `SquircleView`
- `horizontalChannelButton` — `borderRadius: BORDER_RADIUS.SMALL` — if Pressable → `SquircleButton`, if View → `SquircleView`

Style file (`ExploreScreenStyles.ts`) is NOT changed — only the component rendering those styles.

---

### Files: `src/utils/components/truesheet/` (find the .tsx component files)

`sheetStyles.ts` defines these style keys with `borderRadius`. Find the .tsx files that render them:

- `SHEET_STYLES.headerActionButton` — `BORDER_RADIUS.MEDIUM` — likely NativePressable → `SquircleButton`
- `SHEET_STYLES.selectorBox` — `BORDER_RADIUS.SMALL` — View → `SquircleView`
- `COMPOSER_STYLES.inputWrapper` — `BORDER_RADIUS.LARGE` — View → `SquircleView`
- `COMPOSER_STYLES.sendButton` — `BORDER_RADIUS.FULL` — NativePressable → `SquircleButton`
- `COMPOSER_STYLES.addButton` — `BORDER_RADIUS.FULL` — NativePressable → `SquircleButton`

---

### Files: `app/settings/` — 5 files to sweep

All use `app/settings/SettingsStyles.ts`. Style file is NOT changed. Swap JSX in:

**`app/settings/channels.tsx`**

- NativePressable using `styles.channelItem` (`BORDER_RADIUS.MEDIUM`) → `SquircleButton`
- NativePressable using `styles.exploreButton` (`BORDER_RADIUS.FULL`) → `SquircleButton`

**`app/settings/community.tsx`**

- NativePressable using `styles.topicRow` (`BORDER_RADIUS.FULL`) → `SquircleButton`
- Any other NativePressable with a BORDER_RADIUS style → `SquircleButton`

**`app/settings/hidden-posts.tsx`**

- NativePressable rows with `BORDER_RADIUS.MEDIUM` style → `SquircleButton`

**`app/settings/algorithmic-feed.tsx`**

- NativePressable using `styles.exploreButton` (`BORDER_RADIUS.FULL`) → `SquircleButton`
- Inline `borderRadius: 18` on any View/Pressable → change to `BORDER_RADIUS.LARGE` and swap to `SquircleView`/`SquircleButton`

**`app/settings/SettingsScreen.tsx`**

- NativePressable rows using `settingsButtonStyles.primaryButton` or `settingsButtonStyles.menuOption` (`BORDER_RADIUS.LARGE`) → `SquircleButton`
- Note: pre-existing TS error on line 521 (MenuViewRef) — do NOT touch, leave as-is

---

### File: `src/components/layout/header/UniversalHeader.tsx` (ActionButton NativePressables)

The hardcoded values were fixed but the `ActionButton` component's NativePressable elements still
need swapping. This file uses `Animated.View` in places — **skip any `Animated.View`** elements.

Search for `NativePressable` usages at lines ~528, ~554, ~594, ~761 and swap to `SquircleButton`
if (and only if) they have a style that contains `borderRadius`. Add import:

```ts
import { SquircleButton } from '../../ui/Squircle';
```

---

## Important Gotchas for the Continuation Agent

1. **`androidRippleBorderless` must be removed** when swapping any `NativePressable`. It is a
   custom prop only on NativePressable and will cause a TypeScript error on SquircleButton.

2. **Remove unused imports** after swapping. If a file no longer uses `NativePressable`, `View`,
   or `Pressable` from react-native, remove those imports to keep the lint clean.

3. **`overflow: 'hidden'`** — when a button has `overflow: 'hidden'` in its style (e.g., RetryButton,
   CancelButton), SquircleButton respects it and clips children to the squircle boundary. This is
   correct behaviour — no special handling needed.

4. **Style files are never changed** — `SettingsStyles.ts`, `sheetStyles.ts`, `ItemStyles.ts`,
   `ExploreScreenStyles.ts`, `AuthSheetStyles.ts` are all pure `StyleSheet.create()` files. Only
   the component files that render JSX using those styles are touched.

5. **Never import from `react-native-resquircle` directly** in component files. Always use
   `@/components/ui/Squircle` or relative `./Squircle`.

6. **Do not change `borderRadius` values** anywhere. All BORDER_RADIUS.SMALL/MEDIUM/LARGE/FULL
   values remain exactly as-is in StyleSheet definitions.

---

## Verification Steps

After completing the remaining files:

```bash
# 1. Type-check
npx tsc --noEmit

# 2. Lint (check no unused imports)
npm run lint

# 3. Build and test iOS
npx expo run:ios

# 4. Build and test Android
npx expo run:android
```

Visual smoke test screens:

- Settings rows (cards, row items, action buttons)
- Auth sheets (input container pill, submit button)
- Activity screen (segmented chips)
- Comment feeds (image wrappers, link previews)
- Explore screen (search bar, thumbnails)
- Any modal (PopUpModal, Card components)
- Profile/channel header (action buttons)

---

## Global Tuning

To adjust squircle intensity after implementation:

- Edit `CORNER_SMOOTHING` in `src/utils/constants.ts`
- Range: `0.0` (circular arc) → `1.0` (iOS icon-style maximum)
- Default set to `0.6` (library default, matches iOS system squircle)
