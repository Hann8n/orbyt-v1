# Video Editing Features

## Overview

The app now includes comprehensive video editing capabilities powered by FFmpeg, allowing users to capture, trim, reorder, and stitch multiple video clips before posting. The video merging system uses a **complex filter approach** to ensure clean cuts and prevent glitches when mixing different clip types.

## Architecture

### Service Layer

#### VideoEditingService (`src/services/VideoEditingService.ts`)
Advanced video editing operations using FFmpeg:
- **Text Overlays**: Add text to videos with customizable positioning, size, color, and fonts
- **Background Music**: Mix background music with original video audio
- **Volume Control**: Adjust video audio volume
- **Audio Mixing**: Blend multiple audio tracks with independent volume controls

#### VideoProcessingService (`src/services/VideoProcessingService.ts`)
Core video processing with enhanced merging capabilities:
- **Complex Filter Merge**: Single-pass FFmpeg filter graph for seamless video concatenation
- **Format Normalization**: Automatic resolution, frame rate, and audio format standardization
- **Compression**: Quality-controlled compression with size limits
- **Metadata Extraction**: Get video duration, resolution, bitrate, codec information

### Complex Filter Merge Approach

The new `mergeSegmentsComplex()` method solves the "unclean cuts" problem by using a single-pass FFmpeg complex filter graph instead of the traditional "normalize then concat" approach.

**Why Complex Filter?**
- The traditional `concat` demuxer with `-c copy` is fragile when mixing different video types
- Slight differences in audio sample rate, timebase, or pixel aspect ratio cause glitches
- Camera videos (often variable frame rate) mixed with uploaded videos (diverse encodings) fail
- Complex filter processes everything in a single unified stream

**How It Works:**
1. **Accept any input**: Each segment is processed independently in the filter graph
2. **Video normalization**: `scale` + `pad` + `setsar` filters ensure consistent dimensions and aspect ratio
3. **Audio normalization**: `aformat` filter forces 44.1kHz stereo for all audio streams
4. **Single-pass concat**: All normalized streams are concatenated in one operation
5. **Clean output**: Single continuous H.264 video with AAC audio

**Filter Graph Example:**
```
[0:v]scale=1080:1920:...,pad=...,setsar=1,fps=30[v0];
[0:a]aformat=sample_rates=44100:channel_layouts=stereo[a0];
[1:v]scale=1080:1920:...,pad=...,setsar=1,fps=30[v1];
[1:a]aformat=sample_rates=44100:channel_layouts=stereo[a1];
[v0][a0][v1][a1]concat=n=2:v=1:a=1[outv][outa]
```

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
- **Implementation**: Can be added using FFmpeg trim filters
- **Usage**: Cut videos to specific start/end times
- **Future**: Add trim slider UI in editor

### 2. Video Stitching/Concatenation
- **Status**: Fully implemented ✅
- **Implementation**: `VideoProcessingService.mergeSegmentsComplex()`
- **Method**: FFmpeg complex filter (single-pass, prevents glitches)
- **Benefits**: 
  - Clean cuts between different video types
  - No glitches from mixing camera and uploaded videos
  - Handles variable frame rates and different audio formats
  - Single continuous output stream

### 3. Text Overlays
- **Status**: Service implemented ✅
- **Implementation**: `VideoEditingService.addTextOverlay()`
- **Features**:
  - Customizable position (center, corner, custom coordinates)
  - Adjustable font size and color
  - Optional custom font support
  - Automatic text escaping for special characters

### 4. Background Music & Audio Mixing
- **Status**: Service implemented ✅
- **Implementation**: `VideoEditingService.addBackgroundMusic()`
- **Features**:
  - Mix background music with original audio
  - Independent volume controls for video and music
  - Automatic duration matching (music ends when video ends)
  - Support for various audio formats

### 5. Clip Reordering
- **Status**: Fully implemented ✅
- **Implementation**: react-native-draggable-flatlist
- **Usage**: Long press and drag clips to reorder
- **Visual**: Active segment highlighted during drag

### 6. Clip Management
- **Status**: Fully implemented ✅
- **Features**:
  - Delete individual clips
  - View segment duration
  - See source type (camera vs gallery)
  - Visual thumbnail preview

### 7. Video Preview
- **Status**: Fully implemented ✅
- **Usage**: Preview merged video before finalizing
- **Implementation**: Generates merged video in background

## Technical Details

### FFmpeg Integration

**Package**: `ffmpeg-kit-react-native`

**Configuration**: app.json
```json
{
  "package": "min"  // ~10MB per platform
}
```

**Package Options:**
- **min**: Basic FFmpeg functionality (~10MB) - Current choice
  - Includes: video concatenation, trimming, compression, format conversion
  - Sufficient for all current video editing needs
  - Smaller app bundle size
- **min-gpl**: Min + GPL codecs
- **full**: Complete FFmpeg (~60MB)
- **full-gpl**: Full + GPL codecs

**Key Commands**:
```bash
# Complex filter merge (new approach)
-i input1.mp4 -i input2.mp4 -filter_complex "[0:v]scale=1080:1920:...,pad=...[v0];[0:a]aformat=...[a0];[1:v]scale=1080:1920:...,pad=...[v1];[1:a]aformat=...[a1];[v0][a0][v1][a1]concat=n=2:v=1:a=1[outv][outa]" -map "[outv]" -map "[outa]" -c:v libx264 -preset ultrafast -c:a aac output.mp4

# Text overlay
-i input.mp4 -vf "drawtext=text='Hello':fontsize=24:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2" -c:v libx264 -c:a copy output.mp4

# Background music mixing
-i video.mp4 -i music.mp3 -filter_complex "[0:a]volume=0.5[a0];[1:a]volume=1.0[a1];[a0][a1]amix=inputs=2:duration=first[outa]" -map 0:v -map "[outa]" -c:v copy -c:a aac output.mp4

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
3. **Text Overlay UI**: User interface for adding text overlays with real-time preview
4. **Audio Controls UI**: Interface for background music selection and volume controls
5. **Transitions**: Fade, dissolve between clips
6. **Speed Control**: Slow motion, time lapse

### Potential Improvements
- Progress bars for long operations
- Undo/redo functionality
- Segment thumbnails from specific frames
- Multi-select for batch operations
- Export edited videos without posting
- Real-time preview of text overlays and music
- Multiple text overlays at different timestamps
- Audio fade in/out effects

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
