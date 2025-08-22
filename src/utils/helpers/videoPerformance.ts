/**
 * Video Performance Utilities
 * Tools for monitoring and optimizing video playback performance during scrolling
 */

// Performance metrics tracking
interface PerformanceMetrics {
  frameRate: number;
  memoryUsage: number;
  scrollFPS: number;
  videoLoadTime: number;
  bufferTime: number;
}

// Performance thresholds for optimization
const PERFORMANCE_THRESHOLDS = {
  MIN_SCROLL_FPS: 50,
  MAX_MEMORY_USAGE: 100 * 1024 * 1024, // 100MB
  MAX_VIDEO_LOAD_TIME: 2000, // 2 seconds
  MAX_BUFFER_TIME: 1000, // 1 second
} as const;

/**
 * Simple performance monitor for video playback during scrolling
 */
export class VideoPerformanceMonitor {
  private static instance: VideoPerformanceMonitor;
  private metrics: PerformanceMetrics = {
    frameRate: 60,
    memoryUsage: 0,
    scrollFPS: 60,
    videoLoadTime: 0,
    bufferTime: 0,
  };

  private constructor() {}

  static getInstance(): VideoPerformanceMonitor {
    if (!VideoPerformanceMonitor.instance) {
      VideoPerformanceMonitor.instance = new VideoPerformanceMonitor();
    }
    return VideoPerformanceMonitor.instance;
  }

  /**
   * Update scroll FPS metric
   */
  updateScrollFPS(fps: number): void {
    this.metrics.scrollFPS = fps;
    
    // Log performance warnings
    if (fps < PERFORMANCE_THRESHOLDS.MIN_SCROLL_FPS) {
      console.warn(`Low scroll FPS detected: ${fps}. Consider reducing video quality or buffer size.`);
    }
  }

  /**
   * Update video load time
   */
  updateVideoLoadTime(loadTime: number): void {
    this.metrics.videoLoadTime = loadTime;
    
    if (loadTime > PERFORMANCE_THRESHOLDS.MAX_VIDEO_LOAD_TIME) {
      console.warn(`Slow video load time: ${loadTime}ms. Consider preloading or reducing quality.`);
    }
  }

  /**
   * Update buffer time
   */
  updateBufferTime(bufferTime: number): void {
    this.metrics.bufferTime = bufferTime;
    
    if (bufferTime > PERFORMANCE_THRESHOLDS.MAX_BUFFER_TIME) {
      console.warn(`Long buffer time: ${bufferTime}ms. Consider adjusting buffer configuration.`);
    }
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Check if performance is acceptable
   */
  isPerformanceAcceptable(): boolean {
    return (
      this.metrics.scrollFPS >= PERFORMANCE_THRESHOLDS.MIN_SCROLL_FPS &&
      this.metrics.videoLoadTime <= PERFORMANCE_THRESHOLDS.MAX_VIDEO_LOAD_TIME &&
      this.metrics.bufferTime <= PERFORMANCE_THRESHOLDS.MAX_BUFFER_TIME
    );
  }

  /**
   * Get performance recommendations
   */
  getRecommendations(): string[] {
    const recommendations: string[] = [];

    if (this.metrics.scrollFPS < PERFORMANCE_THRESHOLDS.MIN_SCROLL_FPS) {
      recommendations.push('Reduce video buffer size for smoother scrolling');
      recommendations.push('Consider disabling video autoplay during fast scrolling');
    }

    if (this.metrics.videoLoadTime > PERFORMANCE_THRESHOLDS.MAX_VIDEO_LOAD_TIME) {
      recommendations.push('Implement video preloading for better performance');
      recommendations.push('Consider using lower quality video sources');
    }

    if (this.metrics.bufferTime > PERFORMANCE_THRESHOLDS.MAX_BUFFER_TIME) {
      recommendations.push('Increase buffer size or improve network connection');
      recommendations.push('Consider using adaptive bitrate streaming');
    }

    return recommendations;
  }
}

/**
 * Optimize video settings based on device performance
 */
export function getOptimizedVideoSettings(): {
  bufferSize: number;
  preloadDistance: number;
  maxConcurrentVideos: number;
} {
  const monitor = VideoPerformanceMonitor.getInstance();
  const metrics = monitor.getMetrics();

  // Adjust settings based on performance
  if (metrics.scrollFPS < 45) {
    // Aggressive optimization for poor performance
    return {
      bufferSize: 1000, // 1 second buffer
      preloadDistance: 1, // Only preload next video
      maxConcurrentVideos: 1, // Only one video at a time
    };
  } else if (metrics.scrollFPS < 55) {
    // Moderate optimization
    return {
      bufferSize: 2000, // 2 second buffer
      preloadDistance: 2, // Preload next 2 videos
      maxConcurrentVideos: 2, // Allow 2 videos
    };
  } else {
    // Good performance - use standard settings
    return {
      bufferSize: 5000, // 5 second buffer
      preloadDistance: 3, // Preload next 3 videos
      maxConcurrentVideos: 3, // Allow 3 videos
    };
  }
}

/**
 * Check if video should be paused during fast scrolling
 */
export function shouldPauseVideoDuringScroll(scrollVelocity: number): boolean {
  const monitor = VideoPerformanceMonitor.getInstance();
  const metrics = monitor.getMetrics();

  // Pause video if scroll is very fast and performance is poor
  return scrollVelocity > 1000 && metrics.scrollFPS < 50;
}

/**
 * Get optimal video quality based on scroll performance
 */
export function getOptimalVideoQuality(): 'low' | 'medium' | 'high' {
  const monitor = VideoPerformanceMonitor.getInstance();
  const metrics = monitor.getMetrics();

  if (metrics.scrollFPS < 45) {
    return 'low';
  } else if (metrics.scrollFPS < 55) {
    return 'medium';
  } else {
    return 'high';
  }
}

// Export singleton instance
export const videoPerformanceMonitor = VideoPerformanceMonitor.getInstance();
