# Video Thumbnail Color Extraction System

## Overview

The VideoCard component now automatically extracts background colors from video thumbnails to provide a more visually appealing and cohesive user experience. Instead of using a static black background, each video card uses a color extracted from its thumbnail image.

## How It Works

### 1. Color Extraction Process

- **Hook**: `useThumbnailColor(thumbnailUrl)` manages the color extraction
- **Utility**: `extractThumbnailColor()` handles the actual color extraction using `react-native-image-colors`
- **Caching**: Colors are cached for 24 hours to avoid repeated extractions
- **Immediate Extraction**: Colors are extracted as soon as the thumbnail URL is available, not when visible
- **Background Processing**: All extraction happens in the background to avoid blocking the UI

### 2. Performance Optimizations

- **Efficient Caching**: Colors are cached by thumbnail URL with timestamp validation
- **Batch Processing**: Colors are processed in batches of 3 with 100ms delays to avoid overwhelming the system
- **Coordinated Extraction**: Multiple components requesting the same color share the same extraction promise
- **Queue Management**: Smart queue system prevents redundant processing and coordinates batch operations
- **Preloading**: Colors are preloaded when feed data is loaded (first 10 posts)
- **Immediate Extraction**: Colors are extracted as soon as thumbnail URL is available to prevent visual changes
- **Memory Management**: Cache size is limited to 200 entries with LRU eviction

### 3. Fallback Behavior

- **Default Color**: `#000000` (black) is used when:
  - No thumbnail URL is available
  - Color extraction fails
  - Cache is invalid
- **Error Handling**: Silent failures with console warnings for debugging

## Implementation Details

### Files Modified

1. **`src/utils/helpers/video.ts`**
   - Added `extractThumbnailColor()` function
   - Added color caching system
   - Added `preloadThumbnailColors()` for batch processing

2. **`src/hooks/useThumbnailColor.ts`** (new)
   - Custom hook for managing thumbnail color extraction
   - Extracts colors immediately when thumbnail URL is available
   - Provides loading states

3. **`src/components/features/video/VideoCard.tsx`**
   - Integrated `useThumbnailColor` hook
   - Applied extracted color to container, video container, and video player backgrounds
   - Removed hardcoded black backgrounds

4. **`src/hooks/useFeed.ts`**
   - Added automatic preloading of thumbnail colors when feed data loads

### Usage Example

```tsx
// In VideoCard component
const { backgroundColor: thumbnailBackgroundColor } = useThumbnailColor(posterUrl);

// Applied to container
<View style={[styles.container, { backgroundColor: thumbnailBackgroundColor }]}>
  <View style={[styles.videoContainer, { backgroundColor: thumbnailBackgroundColor }]}>
    <Video style={[styles.videoPlayer, { backgroundColor: thumbnailBackgroundColor }]} />
  </View>
</View>
```

## Cache Management

### Cache Statistics

```tsx
import { getThumbnailColorCacheStats } from '../utils/helpers/video';

const stats = getThumbnailColorCacheStats();
console.log(`Cache: ${stats.size}/${stats.maxSize}, Pending: ${stats.pendingCount}, Queue: ${stats.queueLength}, Processing: ${stats.isProcessing}`);
```

### Clearing Cache

```tsx
import { clearThumbnailColorCache } from '../utils/helpers/video';

// Clear all cached colors
clearThumbnailColorCache();
```

## Performance Considerations

1. **Memory Usage**: Cache limited to 200 entries to prevent memory bloat
2. **Network Impact**: Colors are extracted from already-loaded thumbnails
3. **CPU Usage**: Background processing prevents UI blocking
4. **Battery Impact**: Minimal impact due to efficient caching and background processing

## Future Enhancements

1. **Color Palette Extraction**: Extract multiple colors for more sophisticated theming
2. **Dynamic Contrast**: Adjust text colors based on background brightness
3. **User Preferences**: Allow users to disable color extraction
4. **Advanced Caching**: Implement persistent storage for colors across app sessions
