# Video Editing Features

## Overview

The app now includes comprehensive video editing capabilities powered by FFmpeg, allowing users to capture, trim, reorder, and stitch multiple video clips before posting.

## Architecture

### Service Layer

#### VideoEditingService (`src/services/VideoEditingService.ts`)
Core video editing operations using FFmpeg:
- **Video Concatenation**: True multi-segment video merging
- **Video Trimming**: Cut videos to specific time ranges
- **Video Compression**: Quality-controlled compression
- **Metadata Extraction**: Get video duration, resolution, bitrate, etc.
- **Thumbnail Generation**: Extract frames from videos

#### VideoProcessingService (`src/services/VideoProcessingService.ts`)
Enhanced to use VideoEditingService for true video concatenation:
- Primary merge uses FFmpeg-based concatenation
- Fallback method for compatibility
- Compression and optimization maintained

### UI Layer

#### VideoEditorScreen (`app/video-editor.tsx`)
Full-featured video editing interface:
- **Segment List**: Visual list of all video clips with thumbnails
- **Drag-to-Reorder**: Long press and drag to reorder clips
- **Delete Clips**: Remove unwanted segments
- **Preview**: Generate and preview the final merged video
- **Trim UI**: Placeholder for future trim functionality

#### CreateScreen (`app/(tabs)/create.tsx`)
Updated to route to video editor:
- Captures video segments (camera or gallery)
- Routes to editor screen with all segments
- Segments include unique IDs for tracking

## User Flow

```
Camera/Capture Screen (create.tsx)
    ↓
    - Record multiple segments (press & hold)
    - Add from gallery
    - Tap "Done" button
    ↓
Video Editor Screen (video-editor.tsx)
    ↓
    - Reorder clips (drag & drop)
    - Delete unwanted clips
    - Preview merged video
    - Tap "Done" button
    ↓
Post Screen (VideoPostScreen.tsx)
    ↓
    - Receives single merged video file
    - Add description, tags, etc.
    - Publish to Bluesky
```

## Key Features

### 1. Video Clip Trimming
- **Status**: Service ready, UI placeholder
- **Implementation**: `VideoEditingService.trimVideo()`
- **Usage**: Cut videos to specific start/end times
- **Future**: Add trim slider UI in editor

### 2. Video Stitching/Concatenation
- **Status**: Fully implemented ✅
- **Implementation**: `VideoEditingService.concatenateVideos()`
- **Usage**: Merge multiple clips into one seamless video
- **Method**: FFmpeg concat demuxer (fast, preserves quality)

### 3. Clip Reordering
- **Status**: Fully implemented ✅
- **Implementation**: react-native-draggable-flatlist
- **Usage**: Long press and drag clips to reorder
- **Visual**: Active segment highlighted during drag

### 4. Clip Management
- **Status**: Fully implemented ✅
- **Features**:
  - Delete individual clips
  - View segment duration
  - See source type (camera vs gallery)
  - Visual thumbnail preview

### 5. Video Preview
- **Status**: Fully implemented ✅
- **Usage**: Preview merged video before finalizing
- **Implementation**: Generates merged video in background

## Technical Details

### FFmpeg Integration

**Package**: `ffmpeg-kit-react-native`
**Configuration**: app.json (min package ~10MB)

**Key Commands**:
```bash
# Concatenate videos
-f concat -safe 0 -i filelist.txt -c copy output.mp4

# Trim video
-i input.mp4 -ss START -t DURATION -c copy output.mp4

# Compress video
-i input.mp4 -c:v libx264 -crf CRF -preset medium output.mp4
```

### Video Segment Structure

```typescript
interface VideoSegment {
  id: string;                          // Unique identifier
  startTime: number;                   // Capture timestamp
  duration: number;                    // Duration in seconds
  video: VideoFile | ImagePickerAsset; // Video data
  sourceType?: 'camera' | 'gallery';   // Source
  trimStart?: number;                  // Optional trim start
  trimEnd?: number;                    // Optional trim end
}
```

### File Management

**Temporary Processing**: All operations use temporary cache directories
**Cleanup**: Automatic cleanup after processing
**Path Handling**: Ensures proper file:// prefix for local files
**iCloud Support**: Downloads videos from iCloud when needed (iOS)

## Performance Considerations

### Processing Time
- **Concatenation**: Fast with `-c copy` (no re-encoding)
- **Trimming**: Fast with `-c copy` (no re-encoding)
- **Compression**: Slower (requires re-encoding)

### Memory Usage
- Processing occurs in background
- Temporary files cleaned up automatically
- Video thumbnails cached efficiently

### User Feedback
- Loading indicators during processing
- Preview generation shows activity
- Disable buttons during operations

## Error Handling

### FFmpeg Failures
- Primary method: FFmpeg-based concatenation
- Fallback method: Returns first segment
- User-friendly error messages

### File Issues
- Validates file existence before processing
- Downloads from iCloud if needed (iOS)
- Handles missing metadata gracefully

## Future Enhancements

### Planned Features
1. **Trim Slider UI**: Visual timeline for precise trimming
2. **Video Filters**: Color adjustments, brightness, etc.
3. **Audio Controls**: Volume, mute, background music
4. **Text Overlays**: Add text to specific segments
5. **Transitions**: Fade, dissolve between clips
6. **Speed Control**: Slow motion, time lapse

### Potential Improvements
- Progress bars for long operations
- Undo/redo functionality
- Segment thumbnails from specific frames
- Multi-select for batch operations
- Export edited videos without posting

## Testing

### Test Scenarios
1. Single segment (camera) → editor → post
2. Multiple segments (camera) → editor → post
3. Mixed camera + gallery segments → editor → post
4. Reorder segments → preview → post
5. Delete segments → reorder → post
6. Very long videos (test compression)
7. Different aspect ratios
8. Different video formats

### Edge Cases
- Empty segment list
- Very large video files
- Network issues during iCloud download
- FFmpeg failures
- Insufficient storage space

## Dependencies

### Required Packages
- `ffmpeg-kit-react-native`: Video editing operations
- `react-native-draggable-flatlist`: Drag-to-reorder UI
- `react-native-gesture-handler`: Touch gestures
- `react-native-video`: Video preview
- `react-native-vision-camera`: Camera capture
- `expo-file-system`: File operations
- `expo-image-picker`: Gallery selection
- `expo-media-library`: iCloud video access

### Native Modules
- FFmpeg Kit (iOS & Android)
- Vision Camera (iOS & Android)

### Build Configuration
- Requires custom dev client (not Expo Go)
- FFmpeg plugin configured in app.json
- EAS Build compatible

## Troubleshooting

### Common Issues

**FFmpeg Not Working**
- Ensure app.json has FFmpeg plugin
- Run `expo prebuild`
- Rebuild native app

**Videos Won't Merge**
- Check file paths are valid
- Ensure files exist locally
- Check available storage space

**Preview Not Showing**
- Wait for generation to complete
- Check file permissions
- Verify video format compatibility

**Drag Not Working**
- Ensure GestureHandlerRootView wraps component
- Check react-native-gesture-handler is installed
- Verify touch isn't intercepted by other components

## Resources

- [FFmpeg Kit Documentation](https://github.com/arthenica/ffmpeg-kit)
- [FFmpeg Command Reference](https://ffmpeg.org/ffmpeg.html)
- [React Native Draggable FlatList](https://github.com/computerjazz/react-native-draggable-flatlist)
- [Expo File System](https://docs.expo.dev/versions/latest/sdk/filesystem/)
