# Remaining Squircle Swaps — Quick Reference

## Completed Files ✅

- CommentItem.tsx (5 swaps done)
- ExploreSpotlightCarousel.tsx (3 swaps done)
- OrbytChannelsGrid.tsx (1 swap done)
- channels.tsx (2 swaps done)

---

## Files Needing Updates

### `app/settings/community.tsx`

**Add import** (if not already there):

```ts
import { SquircleView, SquircleButton } from '@/components/ui/Squircle';
```

**Swaps:**

- **Line ~69**: `<View style={styles.voteTallyButton}>` → `<SquircleView style={styles.voteTallyButton}>`
- **Line ~158**: `<NativePressable ... style={styles.openForumFooter} ...>` → `<SquircleButton ... style={styles.openForumFooter} ...>`

---

### `app/settings/hidden-posts.tsx`

**Add import**:

```ts
import { SquircleView, SquircleButton } from '@/components/ui/Squircle';
```

**Swaps:**

- **Line ~127**: `<View style={styles.postItem}>` → `<SquircleView style={styles.postItem}>`
- **Line ~144**: `<NativePressable ... style={styles.unhideButton} ...>` → `<SquircleButton ... style={styles.unhideButton} ...>`

---

### `app/settings/algorithmic-feed.tsx`

**Add import**:

```ts
import { SquircleView, SquircleButton } from '@/components/ui/Squircle';
```

**Swaps:**

- **Line ~304**: `<View style={styles.optionCheckbox}>` → `<SquircleView style={styles.optionCheckbox}>`
- **Line ~323**: `<NativePressable ... style={styles.exploreButton} ...>` → `<SquircleButton ... style={styles.exploreButton} ...>`
- **Line ~393**: `<NativePressable ... style={...}} onPress ... borderRadius: 18}>` → `<SquircleButton ...>` (keep inline `borderRadius: 18`)

---

### `app/settings/SettingsScreen.tsx`

**NO CHANGES NEEDED** — No direct borderRadius on any JSX element in this file.

---

### `src/components/layout/header/UniversalHeader.tsx`

**Add import**:

```ts
import { SquircleView, SquircleButton } from '../../ui/Squircle';
```

**Swaps** (all NativePressable → SquircleButton):

- **Line ~528**: animated follow pill `<NativePressable ... borderRadius: pillRadius ...>`
- **Line ~554**: standard ActionButton `<NativePressable ... getButtonSize() ...>`
- **Line ~761**: avatar rounded-square variant `<NativePressable ... avatarRoundedSquare ...>` (only if `avatarStyle === 'rounded-square'`)
- **Line ~849**: subtitle action pill `<NativePressable ... subtitleActionPill ...>`

**Swaps** (View → SquircleView):

- **Line ~863**: `<View style={styles.germCircleButton}>`
- **Line ~884**: `<View style={styles.subtitleSecondaryPill}>`
- **Line ~891**: `<View style={styles.germCircleButtonSecondary}>`

---

## Verification After All Changes

```bash
# Type-check (must pass)
npx tsc --noEmit

# Lint (remove unused imports)
npm run lint

# Visual smoke test
npx expo run:ios

# Alternative Android
npx expo run:android
```

---

## Summary

**Total Swaps Remaining: 18**

- community.tsx: 2
- hidden-posts.tsx: 2
- algorithmic-feed.tsx: 3
- SettingsScreen.tsx: 0
- UniversalHeader.tsx: 7 (3 View → SquircleView + 4 NativePressable → SquircleButton)

All follow the exact same pattern: swap tag names, add import, remove unused NativePressable import if needed.
