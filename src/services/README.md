# Services

This directory contains all the service layer code for the Orbyt app.

## VideoProcessingService

Handles video processing, compression, and optimization for posting to Bluesky.

### Key Features

- **Variable Compression**: Automatically compresses videos to ensure they don't exceed 50MB
- **Progressive Quality Levels**: Uses multiple compression levels (high, medium, low, minimal)
- **File Size Validation**: Checks video file sizes before upload
- **Video Merging**: Combines multiple video segments into single files
- **Comprehensive Video Info**: Provides detailed video metadata including resolution, quality, duration, bitrate, frame rate, and codec
- **Quality Standards**: Supports standard video quality levels (480p, 720p, 1080p, 1440p, 4K)

### Video Quality Standards

The service recognizes and categorizes videos by standard quality levels using the **shorter dimension** to properly classify videos with different aspect ratios:

- **SD (480p)**: Minimum dimension ≥ 480px (e.g., 854x480, 480x640)
- **HD (720p)**: Minimum dimension ≥ 720px (e.g., 1280x720, 720x1280)  
- **Full HD (1080p)**: Minimum dimension ≥ 1080px (e.g., 1920x1080, 1080x1920)
- **2K (1440p)**: Minimum dimension ≥ 1440px (e.g., 2560x1440, 1440x2560)
- **4K (2160p)**: Minimum dimension ≥ 2160px (e.g., 3840x2160, 2160x3840)

**Examples:**
- Portrait video 1080x1792 → **1080p** (shorter dimension is 1080)
- Landscape video 1920x1080 → **1080p** (shorter dimension is 1080)
- Square video 1440x1440 → **1440p** (shorter dimension is 1440)

### Compression Levels

The service uses 4 progressive compression levels:

1. **High Quality**: 2 Mbps, 80% quality
2. **Medium Quality**: 1 Mbps, 60% quality  
3. **Low Quality**: 0.5 Mbps, 40% quality
4. **Minimal Quality**: 0.25 Mbps, 20% quality

### Usage

```typescript
// Get comprehensive video information
const videoInfo = await VideoProcessingService.getVideoInfo(videoPath);
console.log(`Resolution: ${videoInfo.resolution}`);
console.log(`Quality: ${videoInfo.qualityStandard}`);
console.log(`Duration: ${videoInfo.durationFormatted}`);
console.log(`Size: ${videoInfo.sizeFormatted}`);
console.log(`Frame Rate: ${videoInfo.frameRate} fps`);
console.log(`Codec: ${videoInfo.codec}`);

// Get compression options and recommendations
const compressionInfo = await VideoProcessingService.getCompressionInfo(videoPath);
console.log('Original video:', compressionInfo.originalInfo);
console.log('Compression options:', compressionInfo.compressionOptions);
console.log('Recommended level:', compressionInfo.recommendedLevel);

// Optimize a video for posting (automatically handles compression)
const optimizedVideo = await VideoProcessingService.optimizeVideoForPosting(videoPath);

// Check video size before processing
const sizeInfo = await VideoProcessingService.checkVideoSize(videoPath);
if (sizeInfo.needsCompression) {
  console.log(`Video needs compression: ${sizeInfo.sizeMB}MB > ${sizeInfo.maxSizeMB}MB`);
}

// Compress with specific size limit
const compressedVideo = await VideoProcessingService.compressVideoWithSizeLimit(videoPath, 50 * 1024 * 1024);
```

### Video Information Display

The service provides comprehensive video metadata with accurate extraction from multiple sources:

1. **ImagePicker Assets**: Uses duration, width, and height from selected video assets
2. **VideoManager**: Falls back to VideoManager.getVideoInfo() for additional metadata
3. **File System**: Gets accurate file size and path information
4. **Calculated Values**: Estimates bitrate, aspect ratio, and quality standards

The service provides comprehensive video metadata:

- **Resolution**: Width x Height (e.g., "1920x1080")
- **Quality Standard**: Standard quality level (480p, 720p, 1080p, etc.)
- **Duration**: Formatted time (MM:SS)
- **File Size**: Human-readable size (e.g., "15.2 MB")
- **Aspect Ratio**: Video aspect ratio (e.g., "16:9", "9:16")
- **Bitrate**: Video bitrate (e.g., "4.2 Mbps")
- **Frame Rate**: Video frame rate (e.g., "30 fps")
- **Codec**: Video codec (e.g., "H264", "H265")
- **Upload Time Estimate**: Estimated upload time based on file size

### File Size Limits

- **Maximum upload size**: 50MB
- **Automatic compression**: Videos exceeding 50MB are automatically compressed
- **Quality preservation**: Uses the highest quality level that fits within size limits
- **Upload time estimation**: Provides upload time estimates based on file size and network speed

## AtprotoService

Handles all Bluesky API interactions including authentication, posting, and data fetching.

## ProfileCache

Manages user profile data caching and provides hooks for profile data access.

## ModerationService

Handles content moderation and filtering functionality.

## VideoPreloadManager

Manages video preloading and streaming for optimal playback performance. 