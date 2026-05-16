/**
 * SDK-native overlay layering strategy
 *
 * Centralized zIndex management for video card overlays to prevent fragility.
 * Uses a single source of truth for layer ordering instead of scattered hardcoded values.
 *
 * Layer order (bottom to top):
 * 1. Video player/media layer (0-5)
 * 2. Loading overlays (5)
 * 3. Scrubber (10)
 * 4. Overlay UI (12-14)
 * 5. Animations (15)
 * 6. Content warning (20-21)
 */

export const OVERLAY_Z_INDEX = {
  /** Base video player and media layer */
  MEDIA_BASE: 0,
  /** Gesture layer for video interactions */
  GESTURE_LAYER: 1,
  /** Loading and placeholder overlays */
  LOADING_OVERLAY: 5,
  /** Video scrubber controls */
  SCRUBBER: 10,
  /** Main overlay UI container */
  OVERLAY_CONTAINER: 12,
  /** Overlay content (author, caption, actions) */
  OVERLAY_CONTENT: 14,
  /** Heart animation */
  HEART_ANIMATION: 15,
  /** Time display in scrubber */
  SCRUBBER_TIME: 19,
  /** Content warning overlay */
  CONTENT_WARNING: 20,
  /** Content warning message */
  CONTENT_WARNING_MESSAGE: 21,
} as const;
