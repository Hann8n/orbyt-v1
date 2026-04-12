# Feed scroll performance

## FlashList v2 and New Architecture

This app uses **Expo SDK 55** (`expo` ~55.x). The React Native **New Architecture is enabled by default** in current Expo releases, which matches **FlashList v2** requirements. If you disable the New Architecture in a custom dev client, verify FlashList behavior against [FlashList v2 migration](https://shopify.github.io/flash-list/docs/v2-migration).

## Implemented optimizations (video list)

- **iOS scrubber**: `VideoScrubber` is iOS-only and keeps interaction/player-sync work gated by `active` (viewable, no error) while hidden/inactive rows disable touch handling.
- **Visibility selectors**: `VideoItem` uses one `useShallow` subscription with `computeFeedRowVisibility` (see `src/core/visibility/feedRowVisibility.ts`).
- **Overlay opacity**: single `useDerivedValue` in `useVideoCardUiOverlayOpacity` — overlap from `scrollOffsetYSV` × scrubbing fade on the UI thread, no smoothing reaction (stays correct under frame drops; may step slightly if frames skip).

## Measuring before and after

Follow the usual **measure → change → re-measure** loop:

1. Open **React Native DevTools** (Metro `j` or dev menu) and profile JS/React while flinging the home feed.
2. On **iOS**, use **Xcode Instruments → Time Profiler** during scroll; watch main thread when scrubbers mount/unmount.
3. Compare scroll feel with **snap** enabled (`snapToOffsets` on the list): settle time, rubber-band, and scrubber vs vertical scroll at the bottom of the card.

## Manual QA checklist

- [ ] Fling through the feed: no new hitches vs baseline; snap still aligns cards.
- [ ] Only the centered (viewable) item autoplays; neighbors stay paused.
- [ ] iOS scrubber appears on the active clip; drag seek still works; scroll still works when dragging outside the scrub strip.
- [ ] Double-tap like and single-tap play/pause unchanged.
- [ ] Content warning / sensitive overlay: copy, “See video”, and blocked states unchanged.
- [ ] Switch tabs (feeds): playback follows the active feed; no stuck “playing in background” from the inactive tab.

## Automated test

Run visibility logic tests:

```bash
yarn test:feed-visibility
```
