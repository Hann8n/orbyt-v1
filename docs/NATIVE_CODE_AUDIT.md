# Native Code Optimization Audit

This document outlines opportunities to leverage more native code over JavaScript implementations to make the app feel more native to iOS and Android platforms.

## Summary

Your app already uses many native modules (FlashList, Reanimated, Gesture Handler), but there are several areas where you can further leverage native code for better performance and more native-feeling interactions.

---

## Priority 1: High Impact Changes

### 1. Replace KeyboardAvoidingView with react-native-keyboard-controller

**Current State:** You have `react-native-keyboard-controller` installed and `KeyboardProvider` set up, but you're still using the old `KeyboardAvoidingView` component in multiple places.

**Impact:** High - Better keyboard handling, smoother animations, platform-specific behavior

**Files to Update:**
- `app/post/VideoPostScreen.tsx` (lines 378-382, 1472-1544)
- `src/components/features/chat/ChatScreen.tsx` (lines 706-806)
- `app/login.tsx`
- `app/video-editor.tsx`

**Recommendation:**
Replace `KeyboardAvoidingView` with `KeyboardAvoidingView` from `react-native-keyboard-controller` or use the `useKeyboardHandler` hook for custom behavior:

```typescript
import { KeyboardAvoidingView, useKeyboardHandler } from 'react-native-keyboard-controller';
```

The keyboard-controller version provides:
- Better performance (runs on UI thread)
- Smoother animations
- More accurate keyboard height detection
- Better support for multiple keyboards (iPad, external keyboards)

---

### 2. Use Keyboard Controller in KeyboardAwareFooter

**Current State:** `src/utils/truesheet/KeyboardAwareFooter.tsx` uses the React Native `Keyboard` API directly

**Impact:** Medium - Better keyboard event handling

**File:** `src/utils/truesheet/KeyboardAwareFooter.tsx`

**Recommendation:**
Replace Keyboard listeners with `useKeyboardHandler` or `useReanimatedKeyboardAnimation` from `react-native-keyboard-controller`:

```typescript
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
```

This provides:
- More accurate keyboard height
- Better animation timing
- Runs on UI thread with Reanimated
- More reliable cross-platform behavior

---

## Priority 2: Medium Impact Changes

### 4. Replace setInterval in VideoScrubber with Native Events

**Current State:** `src/components/features/video/VideoScrubber.tsx` uses `setInterval` for progress syncing (line 157)

**Impact:** Medium - Better performance, more accurate timing

**File:** `src/components/features/video/VideoScrubber.tsx`

**Recommendation:**
Since you're using `expo-video`, check if the VideoPlayer exposes progress events that you can listen to natively. If available, replace the JavaScript `setInterval` with native event listeners from the video player.

If native events aren't available, consider:
- Using `requestAnimationFrame` instead of `setInterval` for smoother updates
- Reducing the frequency of updates (already at 30fps which is good)
- Using `useAnimatedReaction` from Reanimated to sync values on the UI thread

---

### 5. Consider Using Native ActivityIndicator

**Current State:** You're using custom loading icons (`Loading3FillIcon`)

**Impact:** Low-Medium - More native appearance

**Recommendation:**
For standard loading states, consider using React Native's `ActivityIndicator` which renders native loading spinners on both platforms. This gives:
- Platform-specific appearance (iOS spinner vs Android circular progress)
- Better accessibility
- No custom icon rendering overhead

Keep custom icons for brand-specific loading states, but use `ActivityIndicator` for generic loading.

---

### 6. Leverage Native Text Input Features

**Current State:** Custom text input implementations with overlays

**Impact:** Medium - Better text input experience

**Files:** 
- `app/post/VideoPostScreen.tsx` (DescriptionInputModal)
- Various comment input components

**Recommendation:**
Leverage more native TextInput features:
- Use `textContentType` on iOS for better autocomplete (`.none`, `.emailAddress`, etc.)
- Use `autoComplete` on Android for better suggestions
- Consider `smartInsertDelete` on iOS for better text selection behavior
- Use `textBreakStrategy` on Android for better text wrapping
- Leverage `selectionColor` and `cursorColor` (already using these - good!)

---

### 7. Use Native Modal Presentation Styles (iOS)

**Current State:** Using React Native `Modal` component

**Impact:** Low-Medium - More native iOS feel

**Recommendation:**
On iOS, consider using `presentationStyle` prop:
```typescript
<Modal
  presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
  // ... other props
/>
```

This gives:
- Native iOS sheet presentation on newer iOS versions
- Better gesture dismiss behavior
- More consistent with iOS design patterns

You're already using `TrueSheet` in some places which is great - consider expanding its usage.

---

## Priority 3: Low Impact / Future Considerations

### 8. Consider Native Image Caching

**Current State:** Using `expo-image` which has native caching

**Impact:** Low - Already using native solution

**Status:** ✅ Good - You're using `expo-image` which has native caching built-in. No changes needed.

---

### 9. Use Native List Optimizations

**Current State:** Using FlashList which is excellent

**Impact:** Low - Already optimal

**Status:** ✅ Good - FlashList is a native-optimized list implementation. You're using it correctly with `overrideItemLayout`, `getItemType`, etc.

**Recommendation:** Continue using FlashList over FlatList/ScrollView where possible. Consider replacing any remaining ScrollViews that render lists with FlashList.

---

### 10. Platform-Specific Navigation Bar Behavior

**Current State:** Using `expo-navigation-bar`

**Impact:** Low - Minor polish

**Recommendation:**
Ensure you're using platform-specific behaviors:
- `expo-navigation-bar.setBackgroundColorAsync()` for Android
- `expo-system-ui` for iOS status bar styling
- Consider using `expo-navigation-bar.setVisibilityAsync()` for immersive experiences

---

## Implementation Priority

1. **High Priority:**
   - Replace KeyboardAvoidingView with keyboard-controller (30-60 min per file)

2. **Medium Priority:**
   - Update KeyboardAwareFooter to use keyboard-controller (30 min)
   - Optimize VideoScrubber sync (if native events available, 1 hour)

3. **Low Priority:**
   - Text input native features (15 min per component)
   - Modal presentation styles (5 min per modal)

---

## Benefits Summary

By implementing these changes, you'll get:

1. **Better Performance:**
   - More code running on UI thread
   - Smoother animations
   - Less JavaScript bridge overhead

2. **More Native Feel:**
   - Platform-specific keyboard behavior
   - Native loading indicators where appropriate
   - Better text input experience

3. **Better Reliability:**
   - More accurate keyboard height detection
   - Better cross-platform consistency
   - Fewer timing-related bugs

4. **Future-Proof:**
   - Using modern, actively maintained APIs
   - Better compatibility with new OS versions
   - Easier to maintain

---

## Notes

- You're already doing many things well: FlashList, Reanimated, Gesture Handler, expo-image
- Focus on keyboard handling first as it's the highest impact change
- Test thoroughly on both iOS and Android after each change
- Consider incremental rollout - implement one change at a time
